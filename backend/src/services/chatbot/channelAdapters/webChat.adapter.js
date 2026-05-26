/**
 * Web Chat Adapter - handles messages from the embedded web widget.
 * The widget sends messages via the public API endpoints.
 * This adapter just returns the message data as-is (already handled by chatRouter).
 */
class WebChatAdapter {
  /**
   * Send a reply back via web widget.
   * The actual HTTP response is handled by the controller.
   * @param {object} params
   * @param {string} params.message
   */
  async sendReply({ message }) {
    // Reply is sent via HTTP response in the controller.
    // This adapter is a no-op for sending.
    return { success: true, channel: 'web' };
  }

  /**
   * Parse incoming web widget message.
   */
  parseIncoming(payload) {
    return {
      content: payload.content || payload.message || '',
      attachments: payload.attachments || [],
      visitorInfo: payload.visitorInfo || {},
    };
  }
}

export default new WebChatAdapter();
