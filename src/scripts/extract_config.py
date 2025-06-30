#!/usr/bin/env python3
"""
Enhanced AI Configuration Extraction for MCP Servers
Aligns with plugged.in registry schema and comprehensive extraction needs
"""

import os
import sys
import json
import re
import argparse
from typing import Dict, Any, List, Optional, Tuple
from dataclasses import dataclass
from datetime import datetime
from urllib.parse import urlparse

# Configure loguru before importing contextgem
from loguru import logger
logger.remove()
logger.add(sys.stderr, level="ERROR")

from contextgem import Document, DocumentLLM, StringConcept, JsonObjectConcept
from dotenv import load_dotenv
import requests

load_dotenv()

# Enhanced MCP Registry Schema
MCP_REGISTRY_SCHEMA = {
    "server_detail": {
        "name": str,
        "description": str,
        "version_detail": {
            "version": str,
            "release_date": str,
            "is_latest": bool
        },
        "packages": [{
            "registry_name": str,  # npm|pypi|docker
            "name": str,
            "version": str,
            "package_arguments": [str],
            "environment_variables": [{
                "name": str,
                "description": str,
                "required": bool,
                "default": str,
                "example": str,
                "help_url": str
            }]
        }],
        "repository": {
            "url": str,
            "source": str,  # github|gitlab|bitbucket
            "id": str
        },
        "capabilities": {
            "tools": bool,
            "resources": bool,
            "prompts": bool,
            "logging": bool
        },
        "transport": {
            "type": str,  # stdio|http|sse
            "config": dict
        },
        "installation": {
            "npm": str,
            "pip": str,
            "docker": str,
            "binary": str,
            "source": str
        },
        "requirements": {
            "runtime": str,  # node|python|docker
            "version": str,
            "dependencies": [str]
        }
    }
}


class MCPConfigExtractor:
    def __init__(self, api_key: str = None):
        self.api_key = api_key or os.environ.get("OPENAI_API_KEY")
        if not self.api_key:
            raise ValueError("OPENAI_API_KEY not set")
        
        self.llm = DocumentLLM(
            model="openai/gpt-4o-mini",
            api_key=self.api_key
        )
    
    def extract_configuration(
        self, 
        readme_content: str, 
        package_json: Optional[Dict] = None,
        repo_url: Optional[str] = None,
        code_files: Optional[List[Tuple[str, str]]] = None
    ) -> Dict[str, Any]:
        """Enhanced extraction with multiple sources"""
        
        # Combine all sources
        combined_text = self._combine_sources(
            readme_content, package_json, repo_url, code_files
        )
        
        # Create document with enhanced concepts
        doc = self._create_document(combined_text)
        
        # Extract using LLM
        doc = self.llm.extract_all(doc)
        
        # Build comprehensive configuration
        config = self._build_configuration(doc, package_json, repo_url)
        
        # Enhance with additional detection
        config = self._enhance_configuration(config, readme_content, package_json, code_files)
        
        return config
    
    def _combine_sources(
        self, 
        readme: str, 
        package_json: Optional[Dict],
        repo_url: Optional[str],
        code_files: Optional[List[Tuple[str, str]]]
    ) -> str:
        """Combine all sources into a single document"""
        combined = f"# README Content\n{readme}\n\n"
        
        if package_json:
            combined += f"# Package.json\n```json\n{json.dumps(package_json, indent=2)}\n```\n\n"
        
        if repo_url:
            combined += f"# Repository URL: {repo_url}\n\n"
        
        if code_files:
            for filename, content in code_files[:3]:  # Limit to first 3 files
                combined += f"# Code File: {filename}\n```\n{content[:1000]}\n```\n\n"
        
        return combined
    
    def _create_document(self, text: str) -> Document:
        """Create document with comprehensive extraction concepts"""
        doc = Document(raw_text=text)
        
        doc.concepts = [
            StringConcept(
                name="Server Name",
                description="The official name of the MCP server",
                add_references=True,
                add_justifications=True
            ),
            StringConcept(
                name="Description",
                description="A comprehensive description of the server's functionality",
                add_references=True
            ),
            StringConcept(
                name="Installation Commands",
                description="All installation methods: npm install, pip install, docker pull, etc.",
                add_references=True,
                reference_depth="sentences",
                add_justifications=True
            ),
            StringConcept(
                name="Execution Command",
                description="The command to run the server with all arguments",
                add_references=True,
                add_justifications=True
            ),
            JsonObjectConcept(
                name="Environment Variables",
                description="All environment variables with names, descriptions, required status, and examples",
                structure=[{
                    "name": str,
                    "description": str,
                    "required": bool,
                    "example": str,
                    "default": str
                }],
                add_references=True,
                add_justifications=True
            ),
            StringConcept(
                name="Transport Type",
                description="The transport protocol: stdio, http (streamable), or sse",
                add_references=True
            ),
            StringConcept(
                name="Runtime Requirements",
                description="Runtime environment: Node.js, Python, Docker, etc. with version requirements",
                add_references=True
            ),
            StringConcept(
                name="Dependencies",
                description="Required dependencies or packages",
                add_references=True
            ),
            JsonObjectConcept(
                name="MCP Configuration",
                description="Complete MCP server configuration following registry schema",
                structure=MCP_REGISTRY_SCHEMA["server_detail"],
                add_references=True,
                add_justifications=True
            )
        ]
        
        return doc
    
    def _build_configuration(
        self, 
        doc: Document, 
        package_json: Optional[Dict],
        repo_url: Optional[str]
    ) -> Dict[str, Any]:
        """Build configuration from extracted concepts"""
        config = {
            "server_detail": {},
            "confidence_scores": {},
            "extraction_metadata": {
                "extracted_at": datetime.utcnow().isoformat() + "Z",
                "model": "gpt-4o-mini",
                "sources": []
            }
        }
        
        # Process extracted concepts
        for concept in doc.concepts:
            if concept.name == "MCP Configuration" and hasattr(concept, 'value') and concept.value:
                config["server_detail"] = concept.value
                config["confidence_scores"]["overall"] = 0.85
                break
        
        # Fallback to individual concepts
        if not config["server_detail"]:
            config["server_detail"] = self._build_from_concepts(doc, package_json, repo_url)
            config["confidence_scores"]["overall"] = 0.65
        
        return config
    
    def _build_from_concepts(
        self, 
        doc: Document, 
        package_json: Optional[Dict],
        repo_url: Optional[str]
    ) -> Dict[str, Any]:
        """Build configuration from individual concepts"""
        server = {
            "capabilities": {},
            "installation": {},
            "requirements": {},
            "packages": []
        }
        
        for concept in doc.concepts:
            if not hasattr(concept, 'value') or not concept.value:
                continue
                
            if concept.name == "Server Name":
                server["name"] = concept.value
            elif concept.name == "Description":
                server["description"] = concept.value
            elif concept.name == "Installation Commands":
                server["installation"] = self._parse_installation_commands(concept.value)
            elif concept.name == "Execution Command":
                cmd_parts = concept.value.split()
                if cmd_parts:
                    server["command"] = cmd_parts[0]
                    if len(cmd_parts) > 1:
                        server["args"] = cmd_parts[1:]
            elif concept.name == "Environment Variables":
                server["env"] = self._parse_env_variables(concept.value)
            elif concept.name == "Transport Type":
                server["transport"] = {"type": self._detect_transport(concept.value)}
            elif concept.name == "Runtime Requirements":
                server["requirements"]["runtime"] = self._detect_runtime(concept.value)
        
        # Add repository info
        if repo_url:
            server["repository"] = self._parse_repository_url(repo_url)
        
        # Add package.json data
        if package_json:
            server = self._enhance_from_package_json(server, package_json)
        
        return server
    
    def _enhance_configuration(
        self, 
        config: Dict[str, Any],
        readme: str,
        package_json: Optional[Dict],
        code_files: Optional[List[Tuple[str, str]]]
    ) -> Dict[str, Any]:
        """Enhance configuration with additional detection"""
        server = config["server_detail"]
        
        # Detect capabilities from content
        if "capabilities" not in server or not server["capabilities"]:
            server["capabilities"] = self._detect_capabilities(readme, code_files)
        
        # Detect transport if not found
        if "transport" not in server or not server["transport"]:
            server["transport"] = {"type": self._detect_transport_from_code(code_files)}
        
        # Check npm registry
        if package_json and "name" in package_json:
            npm_info = self._check_npm_registry(package_json["name"])
            if npm_info:
                server["packages"].append({
                    "registry_name": "npm",
                    "name": npm_info["name"],
                    "version": npm_info["version"],
                    "package_arguments": [],
                    "environment_variables": server.get("env", [])
                })
        
        # Calculate completeness score
        required_fields = ["name", "description", "command", "transport"]
        found = sum(1 for field in required_fields if field in server and server[field])
        config["confidence_scores"]["completeness"] = found / len(required_fields)
        
        return config
    
    def _parse_installation_commands(self, text: str) -> Dict[str, str]:
        """Parse various installation commands"""
        installation = {}
        
        # NPM patterns
        npm_match = re.search(r'npm\s+install\s+([^\s]+)', text)
        if npm_match:
            installation["npm"] = f"npm install {npm_match.group(1)}"
        
        # Pip patterns
        pip_match = re.search(r'pip\s+install\s+([^\s]+)', text)
        if pip_match:
            installation["pip"] = f"pip install {pip_match.group(1)}"
        
        # Docker patterns
        docker_match = re.search(r'docker\s+(?:pull|run)\s+([^\s]+)', text)
        if docker_match:
            installation["docker"] = f"docker pull {docker_match.group(1)}"
        
        return installation
    
    def _parse_env_variables(self, env_data: Any) -> List[Dict[str, Any]]:
        """Parse environment variables with enhanced detection"""
        if isinstance(env_data, list):
            return env_data
        
        env_vars = []
        text = str(env_data)
        
        # Pattern for ENV_VAR=description or ENV_VAR: description
        pattern = r'([A-Z_]+(?:_[A-Z]+)*)\s*[=:]\s*([^\n]+)'
        matches = re.findall(pattern, text)
        
        for var_name, description in matches:
            env_vars.append({
                "name": var_name,
                "description": description.strip(),
                "required": True,
                "example": "",
                "help_url": self._get_help_url(var_name)
            })
        
        # Also catch standalone ENV_VARS
        standalone = re.findall(r'\b([A-Z_]+(?:_[A-Z]+)*)\b', text)
        existing_names = {e["name"] for e in env_vars}
        
        for var in standalone:
            if var not in existing_names and len(var) > 3:
                env_vars.append({
                    "name": var,
                    "description": f"Environment variable {var}",
                    "required": True,
                    "example": ""
                })
        
        return env_vars
    
    def _get_help_url(self, var_name: str) -> str:
        """Get help URL for common environment variables"""
        help_urls = {
            "OPENAI_API_KEY": "https://platform.openai.com/api-keys",
            "ANTHROPIC_API_KEY": "https://console.anthropic.com/settings/keys",
            "GITHUB_TOKEN": "https://github.com/settings/tokens",
            "GOOGLE_API_KEY": "https://console.cloud.google.com/apis/credentials",
            "AWS_ACCESS_KEY_ID": "https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_access-keys.html"
        }
        return help_urls.get(var_name, "")
    
    def _detect_transport(self, text: str) -> str:
        """Detect transport type from text"""
        text_lower = text.lower()
        if "stdio" in text_lower or "standard io" in text_lower:
            return "stdio"
        elif "http" in text_lower or "streamable" in text_lower:
            return "http"
        elif "sse" in text_lower or "server-sent" in text_lower:
            return "sse"
        return "stdio"  # Default
    
    def _detect_runtime(self, text: str) -> str:
        """Detect runtime from text"""
        text_lower = text.lower()
        if "node" in text_lower or "npm" in text_lower:
            return "node"
        elif "python" in text_lower or "pip" in text_lower:
            return "python"
        elif "docker" in text_lower:
            return "docker"
        return "unknown"
    
    def _detect_capabilities(self, readme: str, code_files: Optional[List]) -> Dict[str, bool]:
        """Detect MCP capabilities from content"""
        capabilities = {
            "tools": False,
            "resources": False,
            "prompts": False,
            "logging": False
        }
        
        content = readme.lower()
        if code_files:
            for _, code in code_files:
                content += " " + code.lower()
        
        # Detection patterns
        if re.search(r'tools?["\']?\s*:', content) or "list_tools" in content:
            capabilities["tools"] = True
        if re.search(r'resources?["\']?\s*:', content) or "list_resources" in content:
            capabilities["resources"] = True
        if re.search(r'prompts?["\']?\s*:', content) or "list_prompts" in content:
            capabilities["prompts"] = True
        if "logging" in content or "set_logging_level" in content:
            capabilities["logging"] = True
        
        return capabilities
    
    def _parse_repository_url(self, url: str) -> Dict[str, str]:
        """Parse repository URL"""
        parsed = urlparse(url)
        repo_info = {
            "url": url,
            "source": "unknown",
            "id": ""
        }
        
        if "github.com" in parsed.netloc:
            repo_info["source"] = "github"
            # Extract owner/repo from path
            path_parts = parsed.path.strip("/").split("/")
            if len(path_parts) >= 2:
                repo_info["id"] = f"{path_parts[0]}/{path_parts[1]}"
        elif "gitlab.com" in parsed.netloc:
            repo_info["source"] = "gitlab"
        
        return repo_info
    
    def _enhance_from_package_json(self, server: Dict, package_json: Dict) -> Dict:
        """Enhance server config from package.json"""
        if "name" not in server and "name" in package_json:
            server["name"] = package_json["name"]
        
        if "description" not in server and "description" in package_json:
            server["description"] = package_json["description"]
        
        if "version" in package_json:
            server["version_detail"] = {
                "version": package_json["version"],
                "release_date": datetime.utcnow().isoformat() + "Z",
                "is_latest": True
            }
        
        if "bin" in package_json:
            bins = list(package_json["bin"].keys())
            if bins and "command" not in server:
                server["command"] = bins[0]
        
        return server
    
    def _detect_transport_from_code(self, code_files: Optional[List]) -> str:
        """Detect transport from code patterns"""
        if not code_files:
            return "stdio"
        
        for _, content in code_files:
            if "StdioServerTransport" in content:
                return "stdio"
            elif "HttpServerTransport" in content or "StreamableHttpTransport" in content:
                return "http"
            elif "SseServerTransport" in content:
                return "sse"
        
        return "stdio"
    
    def _check_npm_registry(self, package_name: str) -> Optional[Dict]:
        """Check if package exists on npm"""
        try:
            response = requests.get(
                f"https://registry.npmjs.org/{package_name}/latest",
                timeout=5
            )
            if response.status_code == 200:
                data = response.json()
                return {
                    "name": data.get("name"),
                    "version": data.get("version")
                }
        except:
            pass
        return None


def main():
    parser = argparse.ArgumentParser(
        description="Extract MCP server configuration using AI"
    )
    parser.add_argument("--readme", required=True, help="Path to README file")
    parser.add_argument("--package-json", help="Path to package.json file")
    parser.add_argument("--repo-url", help="Repository URL")
    parser.add_argument("--code-dir", help="Directory containing code files")
    parser.add_argument("--output", help="Output file path (default: stdout)")
    parser.add_argument("--api-key", help="OpenAI API key (or use env var)")
    
    args = parser.parse_args()
    
    # Read README
    with open(args.readme, 'r') as f:
        readme_content = f.read()
    
    # Read package.json if provided
    package_json = None
    if args.package_json:
        with open(args.package_json, 'r') as f:
            package_json = json.load(f)
    
    # Read code files if directory provided
    code_files = []
    if args.code_dir:
        for filename in os.listdir(args.code_dir)[:5]:  # Limit to 5 files
            if filename.endswith(('.js', '.ts', '.py')):
                filepath = os.path.join(args.code_dir, filename)
                with open(filepath, 'r') as f:
                    code_files.append((filename, f.read()[:2000]))  # Limit content
    
    try:
        # Initialize extractor
        extractor = MCPConfigExtractor(api_key=args.api_key)
        
        # Extract configuration
        result = extractor.extract_configuration(
            readme_content,
            package_json,
            args.repo_url,
            code_files
        )
        
        # Output result
        output_json = json.dumps(result, indent=2)
        
        if args.output:
            with open(args.output, 'w') as f:
                f.write(output_json)
            print(f"Configuration extracted and saved to {args.output}")
        else:
            print(output_json)
            
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()