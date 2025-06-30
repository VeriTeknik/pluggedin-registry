#!/usr/bin/env python3
"""
AI Configuration Extraction Script
Uses ContextGem to extract MCP server configuration from documentation
"""

import os
import sys
import json
import argparse
from typing import Dict, Any, List, Optional
from dataclasses import dataclass

# Configure loguru before importing contextgem to suppress its output
from loguru import logger
logger.remove()  # Remove default handler
logger.add(sys.stderr, level="ERROR")  # Only log errors to stderr

from contextgem import Document, DocumentLLM, StringConcept, JsonObjectConcept
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Simple dictionary-based structure for contextgem
MCP_CONFIG_STRUCTURE = {
    "name": str,
    "description": str, 
    "command": str,
    "args": list[str],
    "env": dict[str, str],
    "installation": {
        "npm": str,
        "pip": str,
        "docker": str,
        "binary": str
    },
    "capabilities": {
        "tools": bool,
        "resources": bool,
        "prompts": bool,
        "logging": bool
    },
    "transport": str,
    "url": str
}


def extract_configuration(readme_content: str, package_json: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Extract MCP server configuration from README and package.json
    
    Args:
        readme_content: README.md content
        package_json: Parsed package.json content (optional)
        
    Returns:
        Extracted configuration with confidence scores
    """
    # Combine sources
    combined_text = readme_content
    if package_json:
        combined_text += f"\n\n---\nPackage.json:\n{json.dumps(package_json, indent=2)}"
    
    # Create document
    doc = Document(raw_text=combined_text)
    
    # Define extraction concepts
    doc.concepts = [
        StringConcept(
            name="Server Name",
            description="The name of the MCP server",
            add_references=True,
            add_justifications=True
        ),
        StringConcept(
            name="Description",
            description="A brief description of what the server does",
            add_references=True
        ),
        StringConcept(
            name="Installation Command",
            description="The command to install the server (npm install, pip install, etc)",
            add_references=True,
            add_justifications=True
        ),
        StringConcept(
            name="Execution Command",
            description="The command to run the server",
            add_references=True,
            add_justifications=True
        ),
        StringConcept(
            name="Environment Variables",
            description="Environment variables required by the server, with descriptions",
            add_references=True,
            reference_depth="sentences",
            add_justifications=True
        ),
        StringConcept(
            name="Command Arguments",
            description="Command line arguments supported by the server",
            add_references=True,
            add_justifications=True
        ),
        StringConcept(
            name="Capabilities",
            description="MCP capabilities: tools, resources, prompts, logging",
            add_references=True
        ),
        JsonObjectConcept(
            name="Configuration",
            description="Complete MCP server configuration",
            structure=MCP_CONFIG_STRUCTURE,
            add_references=True,
            add_justifications=True
        )
    ]
    
    # Initialize LLM
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY environment variable not set")
    
    llm = DocumentLLM(
        model="openai/gpt-4o-mini",
        api_key=api_key
    )
    
    # Extract concepts
    doc = llm.extract_all(doc)
    
    # Build configuration from extracted concepts
    config = {
        "extracted_config": {},
        "confidence_scores": {},
        "source_files": ["README.md"]
    }
    
    if package_json:
        config["source_files"].append("package.json")
    
    # Process structured configuration if extracted
    for concept in doc.concepts:
        if concept.name == "Configuration" and hasattr(concept, 'value') and concept.value:
            config["extracted_config"] = concept.value
            config["confidence_scores"]["overall"] = 0.8  # Base confidence
            break
    
    # Fall back to individual concepts if structured extraction failed
    if not config["extracted_config"]:
        extracted = {}
        
        for concept in doc.concepts:
            if concept.name == "Server Name" and hasattr(concept, 'value') and concept.value:
                extracted["name"] = concept.value
            elif concept.name == "Description" and hasattr(concept, 'value') and concept.value:
                extracted["description"] = concept.value
            elif concept.name == "Execution Command" and hasattr(concept, 'value') and concept.value:
                command_str = concept.value
                # Parse command string
                parts = command_str.split()
                if parts:
                    extracted["command"] = parts[0]
                    if len(parts) > 1:
                        extracted["args"] = parts[1:]
            elif concept.name == "Environment Variables" and hasattr(concept, 'value') and concept.value:
                # Parse environment variables
                env_text = concept.value
                extracted["env"] = parse_env_variables(env_text)
            elif concept.name == "Capabilities" and hasattr(concept, 'value') and concept.value:
                cap_text = concept.value.lower()
                extracted["capabilities"] = {
                    "tools": "tool" in cap_text,
                    "resources": "resource" in cap_text,
                    "prompts": "prompt" in cap_text,
                    "logging": "logging" in cap_text or "log" in cap_text
                }
        
        # Add package.json data if available
        if package_json:
            if "name" in package_json and "name" not in extracted:
                extracted["name"] = package_json["name"]
            if "description" in package_json and "description" not in extracted:
                extracted["description"] = package_json["description"]
            if "bin" in package_json:
                bin_commands = list(package_json["bin"].keys())
                if bin_commands and "command" not in extracted:
                    extracted["command"] = bin_commands[0]
        
        config["extracted_config"] = extracted
        config["confidence_scores"]["overall"] = 0.6  # Lower confidence for fallback
    
    # Calculate field-specific confidence scores
    required_fields = ["name", "description", "command"]
    found_fields = sum(1 for field in required_fields if field in config["extracted_config"])
    config["confidence_scores"]["completeness"] = found_fields / len(required_fields)
    
    return config


def parse_env_variables(env_text: str) -> Dict[str, Dict[str, Any]]:
    """Parse environment variables from text"""
    env_vars = {}
    
    # Simple pattern matching for ENV_VAR_NAME
    import re
    pattern = r'([A-Z_]+(?:_[A-Z]+)*)'
    matches = re.findall(pattern, env_text)
    
    for var in matches:
        env_vars[var] = {
            "description": f"Environment variable {var}",
            "required": True,
            "example": ""
        }
    
    return env_vars


def main():
    parser = argparse.ArgumentParser(description="Extract MCP server configuration using AI")
    parser.add_argument("--readme", required=True, help="Path to README file")
    parser.add_argument("--package-json", help="Path to package.json file")
    parser.add_argument("--output", help="Output file path (default: stdout)")
    
    args = parser.parse_args()
    
    # Read README
    with open(args.readme, 'r') as f:
        readme_content = f.read()
    
    # Read package.json if provided
    package_json = None
    if args.package_json:
        with open(args.package_json, 'r') as f:
            package_json = json.load(f)
    
    try:
        # Extract configuration
        result = extract_configuration(readme_content, package_json)
        
        # Output result
        output_json = json.dumps(result, indent=2)
        
        if args.output:
            with open(args.output, 'w') as f:
                f.write(output_json)
        else:
            print(output_json)
            
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()