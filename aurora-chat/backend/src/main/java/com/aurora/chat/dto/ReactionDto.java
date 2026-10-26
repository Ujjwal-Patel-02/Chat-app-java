package com.aurora.chat.dto;

import java.util.List;

/** One emoji on a message with everyone who reacted with it. */
public record ReactionDto(String emoji, int count, List<UserSummaryDto> users) {
}
