package com.aurora.chat.dto;

/**
 * Envelope pushed to {@code /user/queue/events}. Types: MESSAGE_CREATED, MESSAGE_UPDATED,
 * REACTIONS_UPDATED, CONVERSATION_UPSERTED, TYPING, READ.
 */
public record ChatEvent(String type, Long conversationId, Object payload) {
}
