import subAssistantRepository from '../../repositories/ai/subAssistant.repository.js';
import knowledgeBaseRepository from '../../repositories/ai/knowledgeBase.repository.js';

class SubAssistantService {
  async getAll(userId) {
    return subAssistantRepository.findAllByUser(userId);
  }

  async getById(id, userId) {
    const sa = await subAssistantRepository.findById(id, userId);
    if (!sa) return null;

    // Attach KBs
    const kbs = await knowledgeBaseRepository.findAllByUser(userId);
    const linked = kbs.filter(kb => String(kb.id_sub_assistant) === String(id));
    return { ...sa, knowledge_bases: linked };
  }

  async create(userId, data) {
    return subAssistantRepository.create(userId, data);
  }

  async update(id, userId, data) {
    const existing = await subAssistantRepository.findById(id, userId);
    if (!existing) throw new Error('Sub-assistant not found');
    return subAssistantRepository.update(id, userId, data);
  }

  async delete(id, userId) {
    const existing = await subAssistantRepository.findById(id, userId);
    if (!existing) throw new Error('Sub-assistant not found');
    return subAssistantRepository.delete(id, userId);
  }
}

export default new SubAssistantService();
