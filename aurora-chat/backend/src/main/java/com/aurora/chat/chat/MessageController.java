package com.aurora.chat.chat;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.aurora.chat.dto.EditMessageRequest;
import com.aurora.chat.dto.MessageDto;
import com.aurora.chat.dto.ReactionRequest;
import com.aurora.chat.dto.ReactionsUpdatedDto;
import com.aurora.chat.security.ChatPrincipal;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/messages")
public class MessageController {

    private final MessageService messageService;

    public MessageController(MessageService messageService) {
        this.messageService = messageService;
    }

    @PatchMapping("/{messageId}")
    public MessageDto edit(@AuthenticationPrincipal ChatPrincipal me, @PathVariable Long messageId,
                           @Valid @RequestBody EditMessageRequest request) {
        return messageService.edit(me.id(), messageId, request.content());
    }

    @DeleteMapping("/{messageId}")
    public MessageDto delete(@AuthenticationPrincipal ChatPrincipal me, @PathVariable Long messageId) {
        return messageService.delete(me.id(), messageId);
    }

    /** Toggles the caller's reaction with the given emoji. */
    @PostMapping("/{messageId}/reactions")
    public ReactionsUpdatedDto react(@AuthenticationPrincipal ChatPrincipal me, @PathVariable Long messageId,
                                     @Valid @RequestBody ReactionRequest request) {
        return messageService.toggleReaction(me.id(), messageId, request.emoji());
    }
}
