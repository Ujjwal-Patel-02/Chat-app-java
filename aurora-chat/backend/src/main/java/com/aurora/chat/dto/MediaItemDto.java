package com.aurora.chat.dto;

import java.time.Instant;

/** One item of a conversation's shared-media gallery. */
public record MediaItemDto(AttachmentDto attachment, Long messageId, UserSummaryDto sender, Instant createdAt) {
}
