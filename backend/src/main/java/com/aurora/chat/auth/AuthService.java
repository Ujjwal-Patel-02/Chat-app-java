package com.aurora.chat.auth;

import java.util.Locale;
import java.util.regex.Pattern;

import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.aurora.chat.common.ApiException;
import com.aurora.chat.common.DtoMapper;
import com.aurora.chat.dto.AuthResponse;
import com.aurora.chat.dto.LoginRequest;
import com.aurora.chat.dto.RegisterRequest;
import com.aurora.chat.security.JwtService;
import com.aurora.chat.user.User;
import com.aurora.chat.user.UserRepository;

@Service
public class AuthService {

    private static final Pattern USERNAME = Pattern.compile("^[a-z0-9_.]{3,20}$");

    private final UserRepository users;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final DtoMapper mapper;

    public AuthService(UserRepository users, PasswordEncoder passwordEncoder, JwtService jwtService,
                       DtoMapper mapper) {
        this.users = users;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.mapper = mapper;
    }

    @Transactional
    public AuthResponse register(RegisterRequest request) {
        String username = normalizeUsername(request.username());
        if (!USERNAME.matcher(username).matches()) {
            throw ApiException.badRequest("Usernames are 3-20 characters: letters, numbers, dots or underscores.");
        }
        String displayName = request.displayName().strip().replaceAll("\\s+", " ");
        if (displayName.isEmpty()) {
            throw ApiException.badRequest("Tell us your name.");
        }
        if (users.existsByUsername(username)) {
            throw ApiException.conflict("That username is already taken.");
        }
        User user = users.save(new User(username, displayName, passwordEncoder.encode(request.password())));
        return new AuthResponse(jwtService.generateToken(user), mapper.user(user));
    }

    @Transactional(readOnly = true)
    public AuthResponse login(LoginRequest request) {
        User user = users.findByUsername(normalizeUsername(request.username()))
                .filter(candidate -> passwordEncoder.matches(request.password(), candidate.getPasswordHash()))
                .orElseThrow(() -> ApiException.unauthorized("Invalid username or password."));
        return new AuthResponse(jwtService.generateToken(user), mapper.user(user));
    }

    private static String normalizeUsername(String raw) {
        return raw == null ? "" : raw.strip().toLowerCase(Locale.ROOT).replaceFirst("^@", "");
    }
}
