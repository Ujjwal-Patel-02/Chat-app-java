package com.aurora.chat.push;

import java.util.Map;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.aurora.chat.dto.PushConfigDto;
import com.aurora.chat.dto.PushEndpointRequest;
import com.aurora.chat.dto.PushSubscriptionRequest;
import com.aurora.chat.security.ChatPrincipal;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/push")
public class PushController {

    private final PushService pushService;
    private final NotificationService notificationService;

    public PushController(PushService pushService, NotificationService notificationService) {
        this.pushService = pushService;
        this.notificationService = notificationService;
    }

    @GetMapping("/config")
    public PushConfigDto config() {
        return pushService.config();
    }

    @PostMapping("/subscriptions")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void subscribe(@AuthenticationPrincipal ChatPrincipal me, @Valid @RequestBody PushSubscriptionRequest request,
                          @RequestHeader(value = HttpHeaders.USER_AGENT, required = false) String userAgent) {
        pushService.subscribe(me.id(), request, userAgent);
    }

    @DeleteMapping("/subscriptions")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void unsubscribe(@AuthenticationPrincipal ChatPrincipal me, @Valid @RequestBody PushEndpointRequest request) {
        pushService.unsubscribe(me.id(), request.endpoint());
    }

    @PostMapping("/test")
    public Map<String, Integer> test(@AuthenticationPrincipal ChatPrincipal me) {
        return Map.of("devices", pushService.sendTest(me.id(), notificationService.testPayload()));
    }
}
