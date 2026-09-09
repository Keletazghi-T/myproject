package com.example.springbootapp;

import java.net.URI;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/meetings")
public class MeetingController {
    private final DatabaseService database;
    private final CurrentAccount accounts;
    public MeetingController(DatabaseService database, CurrentAccount accounts) {
        this.database = database;
        this.accounts = accounts;
    }
    @PostMapping
    public Meeting schedule(@Valid @RequestBody MeetingRequest request, Authentication authentication) {
        accounts.requireAdmin(authentication);
        try {
            LocalDate.parse(request.date());
            LocalTime.parse(request.time());
            URI link = URI.create(request.joinUrl());
            String host = link.getHost();
            boolean validHost = host != null && switch (request.platform()) {
                case "Zoom" -> host.equals("zoom.us") || host.endsWith(".zoom.us");
                case "Google Meet" -> host.equals("meet.google.com");
                case "Microsoft Teams" -> host.equals("teams.microsoft.com") || host.equals("teams.live.com") || host.equals("teams.cloud.microsoft");
                default -> false;
            };
            if (!"https".equals(link.getScheme()) || link.getUserInfo() != null || !validHost
                    || !List.of("30 minutes", "1 hour", "2 hours").contains(request.duration())) {
                throw new IllegalArgumentException();
            }
        } catch (IllegalArgumentException | java.time.format.DateTimeParseException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Enter a valid date, time, duration, and HTTPS invitation link for the selected platform.");
        }
        return database.saveMeeting(request);
    }
    @GetMapping
    public List<Meeting> getMeetings(Authentication authentication) {
        accounts.require(authentication);
        return database.findMeetings();
    }
    @GetMapping("/{id}")
    public ResponseEntity<Meeting> getMeeting(@PathVariable String id, Authentication authentication) {
        accounts.require(authentication);
        Meeting meeting = database.findMeeting(id);
        return meeting == null ? ResponseEntity.notFound().build() : ResponseEntity.ok(meeting);
    }
    @GetMapping("/notifications")
    public List<Notification> getNotifications(Authentication authentication) {
        accounts.require(authentication);
        return database.findNotifications();
    }
    public record MeetingRequest(@NotBlank @Size(max=255) String title, @NotBlank @Size(max=30) String date,
            @NotBlank @Size(max=30) String time, @NotBlank @Size(max=50) String duration,
            @NotBlank @Size(max=50) String platform, @NotBlank @Size(max=2000) String joinUrl) {}
    public record Meeting(String id, String title, String date, String time, String duration, String platform, String link, String joinUrl) {}
    public record Notification(String audience, String message, String link) {}
}
