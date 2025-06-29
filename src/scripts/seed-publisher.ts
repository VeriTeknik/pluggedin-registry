import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Publisher } from '../models';
import { TrustLevel } from '../models/types';

dotenv.config();

async function seedPublisher() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/mcp-registry');
    console.log('Connected to MongoDB');

    // Create a test publisher
    const publisher = new Publisher({
      _id: new mongoose.Types.ObjectId('507f1f77bcf86cd799439011'), // Fixed ObjectId
      username: 'test-publisher',
      email: 'test@example.com',
      password_hash: 'hashed-password', // In real app, this would be properly hashed
      verified_domains: ['example.com'],
      github_orgs: ['test-org'],
      trust_level: TrustLevel.DOMAIN_VERIFIED,
    });

    await publisher.save();
    console.log('Test publisher created:', publisher.toJSON());

    process.exit(0);
  } catch (error) {
    console.error('Error seeding publisher:', error);
    process.exit(1);
  }
}

seedPublisher();