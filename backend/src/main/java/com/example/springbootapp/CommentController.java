package com.example.springbootapp;

import java.util.List;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/comments")
public class CommentController {
    private final DatabaseService database;
    private final CurrentAccount accounts;
    public CommentController(DatabaseService database, CurrentAccount accounts) {
        this.database = database;
        this.accounts = accounts;
    }
    @GetMapping
    public List<Comment> getComments(Authentication authentication) {
        accounts.require(authentication);
        return database.findComments();
    }
    @PostMapping
    public Comment addComment(@Valid @RequestBody CommentRequest comment, Authentication authentication) {
        return database.saveComment(new Comment(null, accounts.require(authentication).name(), comment.text().trim()));
    }
    @PostMapping("/{id}/replies")
    public Comment reply(@PathVariable long id, @Valid @RequestBody CommentRequest comment, Authentication authentication) {
        String author = accounts.require(authentication).name();
        return database.saveReply(id, author, comment.text().trim());
    }
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteComment(@PathVariable long id, Authentication authentication) {
        accounts.requireAdmin(authentication);
        return database.deleteComment(id) ? ResponseEntity.noContent().build() : ResponseEntity.notFound().build();
    }
    public record Comment(Long id, String author, String text, Long parentId) {
        public Comment(Long id, String author, String text) { this(id, author, text, null); }
    }
    public record CommentRequest(@NotBlank @Size(max=4000) String text) {}
}
