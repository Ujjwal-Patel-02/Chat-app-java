package com.aurora.chat.user;

import java.time.Instant;
import java.util.List;
import java.util.Locale;

import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.aurora.chat.common.ApiException;
import com.aurora.chat.common.DtoMapper;
import com.aurora.chat.dto.UserDto;

@Service
public class UserService {

    private static final int MAX_RESULTS = 50;

    private final UserRepository users;
    private final DtoMapper mapper;

    public UserService(UserRepository users, DtoMapper mapper) {
        this.users = users;
        this.mapper = mapper;
    }

    @Transactional(readOnly = true)
    public UserDto get(Long id) {
        return users.findById(id).map(mapper::user)
                .orElseThrow(() -> ApiException.unauthorized("Your account no longer exists. Please sign up again."));
    }

    @Transactional(readOnly = true)
    public List<UserDto> search(Long currentUserId, String query) {
        String q = query == null ? "" : query.trim().toLowerCase(Locale.ROOT).replaceFirst("^@", "");
        PageRequest page = PageRequest.of(0, MAX_RESULTS);
        List<User> found = q.isEmpty()
                ? users.findAllExcept(currentUserId, page)
                : users.search(currentUserId, "%" + q + "%", page);
        return found.stream().map(mapper::user).toList();
    }

    @Transactional
    public void touchLastSeen(Long userId, Instant when) {
        users.findById(userId).ifPresent(user -> user.setLastSeenAt(when));
    }
}
