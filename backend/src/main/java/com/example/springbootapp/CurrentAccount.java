package com.example.springbootapp;

import java.io.Serializable;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class CurrentAccount {
    private final DatabaseService database;
    public CurrentAccount(DatabaseService database) { this.database = database; }

    // Bind a session to a credential version, so password changes invalidate older sessions.
    public record Identity(String email, String passwordHash) implements Serializable {}

    public AuthController.Account require(Authentication authentication) {
        if (authentication == null || !(authentication.getPrincipal() instanceof Identity identity)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Please log in.");
        }
        AuthController.Account account = database.findAccount(identity.email()).orElseThrow(
                () -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Please log in again."));
        if (!account.password().equals(identity.passwordHash())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Please log in again.");
        }
        return account;
    }

    public AuthController.Account requireAdmin(Authentication authentication) {
        AuthController.Account account = require(authentication);
        if (!"ADMIN".equals(account.role())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only admins can perform this action.");
        }
        return account;
    }
}
