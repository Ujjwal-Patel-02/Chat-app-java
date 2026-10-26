package com.aurora.chat.user;

import java.util.List;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.aurora.chat.dto.UserDto;
import com.aurora.chat.security.ChatPrincipal;

@RestController
@RequestMapping("/api/users")
public class UserController {

    private final UserService userService;

    public UserController(UserService userService) {
        this.userService = userService;
    }

    /** Everyone except the caller, optionally filtered by username / display name. */
    @GetMapping
    public List<UserDto> search(@AuthenticationPrincipal ChatPrincipal me,
                                @RequestParam(required = false) String query) {
        return userService.search(me.id(), query);
    }
}
