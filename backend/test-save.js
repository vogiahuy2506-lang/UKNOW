import zaloPersonalRepository from './src/repositories/chatbot/zaloPersonal.repository.js';
import { fileURLToPath } from 'url';
import path from 'path';

// Test saving a message
const testData = {
  conversationId: 1,
  userId: 3,
  zaloSettingId: 7,
  role: 'visitor',
  content: 'Test message content',
  externalId: 'test_msg_123',
  externalTs: new Date().toISOString(),
  metadata: JSON.stringify({
    sender_name: 'Test User',
    sender_id: '123456789',
    is_group: false,
  }),
  createdAt: new Date().toISOString(),
};

console.log('Testing insertMessage...');
try {
  const result = await zaloPersonalRepository.insertMessage(testData);
  console.log('Success! Inserted row:', result);
} catch (err) {
  console.error('Error:', err.message, err.stack);
}
