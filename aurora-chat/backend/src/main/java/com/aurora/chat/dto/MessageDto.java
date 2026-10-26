package com.aurora.chat.dto;

import java.time.Instant;
import java.util.List;

/**
 * A chat message. {@code clientId} echoes the sender's optimistic-UI id and is only present in the
 * response/event produced at send time. {@code content} may be null for photo/video-only messages.
 */
public record MessageDto(Long id, Long conversationId, UserSummaryDto sender, String content, Instant createdAt,
                         Instant editedAt, boolean deleted, ReplyPreviewDto replyTo, List<ReactionDto> reactions,
                         List<AttachmentDto> attachments, String clientId) {
}
