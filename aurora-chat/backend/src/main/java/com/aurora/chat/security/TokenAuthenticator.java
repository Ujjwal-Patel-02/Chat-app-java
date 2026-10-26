package com.aurora.chat.security;

import java.util.List;
import java.util.Optional;

import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import com.aurora.chat.user.UserRepository;

/**
 * Turns an {@code Authorization: Bearer <jwt>} header value into an authenticated principal.
 * Shared by the HTTP filter and the STOMP CONNECT interceptor. The user must still exist
 * (guards against tokens that outlive a database reset).
 */
@Component
public class TokenAuthenticator {

    private final JwtService jwtService;
    private final UserRepository users;

    public TokenAuthenticator(JwtService jwtService, UserRepository users) {
        this.jwtService = jwtService;
        this.users = users;
    }

    @Transactional(readOnly = true)
    public Optional<UsernamePasswordAuthenticationToken> authenticate(String authorizationHeader) {
        if (authorizationHeader == null || authorizationHeader.isBlank()) {
            return Optional.empty();
        }
        String token = authorizationHeader.trim();
        if (token.regionMatches(true, 0, "Bearer ", 0, 7)) {
            token = token.substring(7).trim();
        }
        if (token.isEmpty()) {
            return Optional.empty();
        }
        return jwtService.parse(token)
                .filter(principal -> users.findById(principal.id())
                        .map(user -> user.getUsername().equals(principal.username()))
                        .orElse(false))
                .map(principal -> new UsernamePasswordAuthenticationToken(
                        principal, null, List.of(new SimpleGrantedAuthority("ROLE_USER"))));
    }
}
