/**
 * Server-Sent Events (SSE) Service
 *
 * Broadcasting real-time events to connected clients.
 */
const MAX_CLIENTS_PER_USER = 5;

class SSEService {
  constructor() {
    // Map of userId (string) -> Set of response objects (insertion order)
    this.clients = new Map();
  }

  _normalizeUserId(userId) {
    return String(userId);
  }

  /**
   * Add a client connection for a user. Evicts oldest if over max.
   *
   * NOTE: If MAX_CLIENTS_PER_USER is ever set to 1, do not delete the Map key
   * inside the eviction loop before `userClients.add(res)` — otherwise `add`
   * mutates an orphaned Set and the new client never receives broadcasts.
   * Safe at MAX=5 today; revisit if the cap drops to 1.
   */
  addClient(userId, res) {
    const key = this._normalizeUserId(userId);
    if (!this.clients.has(key)) {
      this.clients.set(key, new Set());
    }
    const userClients = this.clients.get(key);

    while (userClients.size >= MAX_CLIENTS_PER_USER) {
      const oldest = userClients.values().next().value;
      if (!oldest) break;
      try {
        if (oldest.__sseHeartbeat) {
          clearInterval(oldest.__sseHeartbeat);
          oldest.__sseHeartbeat = null;
        }
        oldest.end();
      } catch {
        // ignore close errors
      }
      userClients.delete(oldest);
    }

    userClients.add(res);
    console.log(`[SSE] Client connected: userId=${key}. Total clients: ${this.getTotalClients()}`);
  }

  /**
   * Remove a client connection
   */
  removeClient(userId, res) {
    const key = this._normalizeUserId(userId);
    const userClients = this.clients.get(key);
    if (userClients) {
      userClients.delete(res);
      if (userClients.size === 0) {
        this.clients.delete(key);
      }
    }
    console.log(`[SSE] Client disconnected: userId=${key}. Total clients: ${this.getTotalClients()}`);
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
   * Clients for one user (test helper)
   */
  getClientCountForUser(userId) {
    const userClients = this.clients.get(this._normalizeUserId(userId));
    return userClients ? userClients.size : 0;
  }

  /**
   * Broadcast event to specific user
   */
  broadcast(userId, eventType, data) {
    const key = this._normalizeUserId(userId);
    const userClients = this.clients.get(key);
    if (!userClients || userClients.size === 0) {
      return;
    }

    const message = this.formatEvent(eventType, data);

    for (const res of userClients) {
      try {
        res.write(message);
      } catch (err) {
        console.error(`[SSE] Failed to send to client:`, err.message);
        this.removeClient(key, res);
      }
    }
  }

  /**
   * Broadcast to multiple users
   */
  broadcastToUsers(userIds, eventType, data) {
    userIds.forEach((id) => this.broadcast(id, eventType, data));
  }

  /**
   * Format SSE event
   */
  formatEvent(eventType, data) {
    return `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
  }

  /** Test helper — wipe all clients and clear any leftover heartbeats */
  _resetForTests() {
    for (const clients of this.clients.values()) {
      for (const res of clients) {
        if (res.__sseHeartbeat) {
          clearInterval(res.__sseHeartbeat);
          res.__sseHeartbeat = null;
        }
      }
    }
    this.clients.clear();
  }
}

export default new SSEService();
