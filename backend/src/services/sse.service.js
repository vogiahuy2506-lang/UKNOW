/**
 * Server-Sent Events (SSE) Service
 * 
 * Broadcasting real-time events to connected clients.
 */
class SSEService {
  constructor() {
    // Map of userId -> Set of response objects
    this.clients = new Map();
  }

  /**
   * Add a client connection for a user
   */
  addClient(userId, res) {
    if (!this.clients.has(userId)) {
      this.clients.set(userId, new Set());
    }
    this.clients.get(userId).add(res);
    console.log(`[SSE] Client connected: userId=${userId}. Total clients: ${this.getTotalClients()}`);
  }

  /**
   * Remove a client connection
   */
  removeClient(userId, res) {
    const userClients = this.clients.get(userId);
    if (userClients) {
      userClients.delete(res);
      if (userClients.size === 0) {
        this.clients.delete(userId);
      }
    }
    console.log(`[SSE] Client disconnected: userId=${userId}. Total clients: ${this.getTotalClients()}`);
  }

  /**
   * Get total number of connected clients
   */
  getTotalClients() {
    let total = 0;
    for (const clients of this.clients.values()) {
      total += clients.size;
    }
    return total;
  }

  /**
   * Broadcast event to specific user
   */
  broadcast(userId, eventType, data) {
    const userClients = this.clients.get(userId);
    if (!userClients || userClients.size === 0) {
      return;
    }

    const message = this.formatEvent(eventType, data);
    
    for (const res of userClients) {
      try {
        res.write(message);
      } catch (err) {
        console.error(`[SSE] Failed to send to client:`, err.message);
        this.removeClient(userId, res);
      }
    }
  }

  /**
   * Broadcast to multiple users
   */
  broadcastToUsers(userIds, eventType, data) {
    userIds.forEach(userId => this.broadcast(userId, eventType, data));
  }

  /**
   * Format SSE event
   */
  formatEvent(eventType, data) {
    return `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
  }
}

export default new SSEService();
