package com.example.springbootapp;

import java.util.List;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private final DatabaseService database;
    private final VoiceService voice;
    private final CurrentAccount currentAccount;
    private final PasswordEncoder passwords;
    private final SecurityContextRepository contexts;
    private final String dummyHash;

    public AuthController(DatabaseService database, CurrentAccount currentAccount, VoiceService voice,
            PasswordEncoder passwords, SecurityContextRepository contexts) {
        this.database = database;
        this.voice = voice;
        this.currentAccount = currentAccount;
        this.passwords = passwords;
        this.contexts = contexts;
        this.dummyHash = passwords.encode(java.util.UUID.randomUUID().toString());
    }

    @GetMapping("/csrf")
    public CsrfResponse csrf(CsrfToken token) { return new CsrfResponse(token.getToken()); }

    @PostMapping("/register")
    public ResponseEntity<String> register(@Valid @RequestBody Registration account) {
        validatePassword(account.password());
        String email = account.email().trim();
        if (database.accountExists(email)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "An account with this email already exists.");
        }
        database.saveAccount(account.name().trim(), email, passwords.encode(account.password()), "USER");
        return ResponseEntity.status(HttpStatus.CREATED).body("Account created successfully.");
    }

    @PostMapping("/login")
    public LoginResponse login(@Valid @RequestBody LoginRequest credentials,
            HttpServletRequest request, HttpServletResponse response) {
        Account account = database.findAccount(credentials.email().trim()).orElse(null);
        boolean matches = passwords.matches(credentials.password(), account == null ? dummyHash : account.password());
        if (account == null || !matches) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Incorrect email or password.");
        }
        signIn(account, request, response);
        return profile(account);
    }

    @GetMapping("/me")
    public LoginResponse me(Authentication authentication) { return profile(currentAccount.require(authentication)); }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(HttpServletRequest request) {
        var authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && authentication.getPrincipal() instanceof CurrentAccount.Identity identity) voice.logout(identity.email());
        if (request.getSession(false) != null) request.getSession(false).invalidate();
        SecurityContextHolder.clearContext();
        return ResponseEntity.noContent().build();
    }

    @PutMapping("/account")
    public LoginResponse updateAccount(@Valid @RequestBody AccountUpdateRequest update, Authentication authentication,
            HttpServletRequest request, HttpServletResponse response) {
        Account current = currentAccount.require(authentication);
        String email = update.email().trim();
        if (!current.email().equals(email) && database.accountExists(email)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "An account with this email already exists.");
        }
        String password = current.password();
        if (update.password() != null && !update.password().isEmpty()) {
            validatePassword(update.password());
            password = passwords.encode(update.password());
        }
        database.updateAccount(current.email(), update.name().trim(), email, password, current.role());
        Account updated = new Account(update.name().trim(), email, password, current.role());
        signIn(updated, request, response);
        return profile(updated);
    }

    @DeleteMapping("/account")
    public ResponseEntity<Void> deleteAccount(Authentication authentication, HttpServletRequest request) {
        database.deleteAccount(currentAccount.require(authentication).email());
        return logout(request);
    }

    private void signIn(Account account, HttpServletRequest request, HttpServletResponse response) {
        if (request.getSession(false) != null) request.getSession(false).invalidate();
        request.getSession(true);
        var context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(new UsernamePasswordAuthenticationToken(
                new CurrentAccount.Identity(account.email(), account.password()), null,
                List.of(new SimpleGrantedAuthority("ROLE_" + account.role()))));
        SecurityContextHolder.setContext(context);
        contexts.saveContext(context, request, response);
    }

    private void validatePassword(String password) {
        if (password == null || password.isBlank()
                || password.length() > 255) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Password is required and must be at most 255 characters.");
        }
    }

    private LoginResponse profile(Account account) { return new LoginResponse(account.name(), account.email(), account.role()); }

    public record Account(String name, String email, String password, String role) {}
    public record Registration(@NotBlank @Size(max=255) String name, @NotBlank @Email @Size(max=255) String email,
            @NotBlank @Size(max=255) String password) {}
    public record LoginRequest(@NotBlank @Size(max=255) String email, @NotBlank @Size(max=255) String password) {}
    public record AccountUpdateRequest(@NotBlank @Size(max=255) String name,
            @NotBlank @Email @Size(max=255) String email, @Size(max=255) String password) {}
    public record LoginResponse(String name, String email, String role) {}
    public record CsrfResponse(String token) {}
}
