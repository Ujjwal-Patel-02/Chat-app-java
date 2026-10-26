package com.aurora.chat.chat;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.aurora.chat.dto.ConversationDto;
import com.aurora.chat.dto.CreateDirectRequest;
import com.aurora.chat.dto.CreateGroupRequest;
import com.aurora.chat.dto.MarkReadRequest;
import com.aurora.chat.dto.MediaItemDto;
import com.aurora.chat.dto.MuteRequest;
import com.aurora.chat.dto.MuteStateDto;
import com.aurora.chat.media.MediaService;
import com.aurora.chat.dto.MessageDto;
import com.aurora.chat.dto.SendMessageRequest;
import com.aurora.chat.security.ChatPrincipal;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/conversations")
public class ConversationController {

    private final ConversationService conversationService;
    private final MessageService messageService;
    private final MediaService mediaService;

    public ConversationController(ConversationService conversationService, MessageService messageService,
                                  MediaService mediaService) {
        this.conversationService = conversationService;
        this.messageService = messageService;
        this.mediaService = mediaService;
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

    @PutMapping("/{conversationId}/mute")
    public MuteStateDto mute(@AuthenticationPrincipal ChatPrincipal me, @PathVariable Long conversationId,
                             @RequestBody MuteRequest request) {
        return conversationService.setMuted(me.id(), conversationId, request.muted());
    }

    /** Shared photos & videos, newest first; page with {@code before=<messageId>}. */
    @GetMapping("/{conversationId}/media")
    public List<MediaItemDto> media(@AuthenticationPrincipal ChatPrincipal me, @PathVariable Long conversationId,
                                    @RequestParam(required = false) Long before,
                                    @RequestParam(defaultValue = "60") int limit) {
        conversationService.requireMembership(conversationId, me.id());
        return mediaService.conversationMedia(conversationId, before, limit);
    }

    @PostMapping("/{conversationId}/read")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void markRead(@AuthenticationPrincipal ChatPrincipal me,
                         @PathVariable Long conversationId,
                         @Valid @RequestBody MarkReadRequest request) {
        conversationService.markRead(me.id(), conversationId, request.messageId());
    }
}
