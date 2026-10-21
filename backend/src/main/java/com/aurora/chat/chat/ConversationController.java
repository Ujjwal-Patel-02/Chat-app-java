package com.aurora.chat.chat;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.aurora.chat.dto.ConversationDto;
import com.aurora.chat.dto.CreateDirectRequest;
import com.aurora.chat.dto.CreateGroupRequest;
import com.aurora.chat.dto.MarkReadRequest;
import com.aurora.chat.dto.MessageDto;
import com.aurora.chat.dto.SendMessageRequest;
import com.aurora.chat.security.ChatPrincipal;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/conversations")
public class ConversationController {

    private final ConversationService conversationService;
    private final MessageService messageService;

    public ConversationController(ConversationService conversationService, MessageService messageService) {
        this.conversationService = conversationService;
        this.messageService = messageService;
    }

    @GetMapping
    public List<ConversationDto> list(@AuthenticationPrincipal ChatPrincipal me) {
        return conversationService.listForUser(me.id());
    }

    @PostMapping("/direct")
    public ConversationDto openDirect(@AuthenticationPrincipal ChatPrincipal me,
                                      @Valid @RequestBody CreateDirectRequest request) {
        return conversationService.getOrCreateDirect(me.id(), request.userId());
    }

    @PostMapping("/group")
    @ResponseStatus(HttpStatus.CREATED)
    public ConversationDto createGroup(@AuthenticationPrincipal ChatPrincipal me,
                                       @Valid @RequestBody CreateGroupRequest request) {
        return conversationService.createGroup(me.id(), request.name(), request.memberIds());
    }

    @GetMapping("/{conversationId}/messages")
    public List<MessageDto> messages(@AuthenticationPrincipal ChatPrincipal me,
                                     @PathVariable Long conversationId,
                                     @RequestParam(required = false) Long before,
                                     @RequestParam(defaultValue = "" + MessageService.DEFAULT_PAGE_SIZE) int limit) {
        return messageService.list(me.id(), conversationId, before, limit);
    }

    @PostMapping("/{conversationId}/messages")
    @ResponseStatus(HttpStatus.CREATED)
    public MessageDto send(@AuthenticationPrincipal ChatPrincipal me,
                           @PathVariable Long conversationId,
                           @Valid @RequestBody SendMessageRequest request) {
        return messageService.send(me.id(), conversationId, request);
    }

    @PostMapping("/{conversationId}/read")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void markRead(@AuthenticationPrincipal ChatPrincipal me,
                         @PathVariable Long conversationId,
                         @Valid @RequestBody MarkReadRequest request) {
        conversationService.markRead(me.id(), conversationId, request.messageId());
    }
}
