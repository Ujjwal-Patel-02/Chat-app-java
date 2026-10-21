package com.aurora.chat.dto;

import java.util.List;

public record ReactionsUpdatedDto(Long messageId, List<ReactionDto> reactions) {
}
