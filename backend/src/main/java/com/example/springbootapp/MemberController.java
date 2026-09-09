package com.example.springbootapp;

import java.util.List;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/members")
public class MemberController {
    private final DatabaseService database;
    private final CurrentAccount accounts;
    public MemberController(DatabaseService database, CurrentAccount accounts) {
        this.database = database;
        this.accounts = accounts;
    }
    @GetMapping
    public List<Member> getMembers(Authentication authentication) {
        var current = accounts.require(authentication);
        boolean admin = "ADMIN".equals(current.role());
        return database.findMembers().stream().map(account -> new Member(account.id(), account.name(),
                admin ? account.email() : null, admin ? account.role() : null, account.email().equals(current.email()), account.joinedAt())).toList();
    }
    public record Member(String id, String name, String email, String role, boolean self, java.time.OffsetDateTime joinedAt) {}
}
