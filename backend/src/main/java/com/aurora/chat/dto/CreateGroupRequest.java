package com.aurora.chat.dto;

import java.util.List;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;

public record CreateGroupRequest(
        @NotBlank(message = "Give your group a name.")
        @Size(max = 60, message = "Group names can be up to 60 characters.")
        String name,
        @NotEmpty(message = "Pick at least one person for the group.")
        @Size(max = 50, message = "Groups can have up to 50 members.")
        List<Long> memberIds) {
}
