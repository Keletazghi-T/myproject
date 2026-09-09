package com.example.springbootapp;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class WelcomeController {

    @GetMapping({"/", "/api/health"})
    public String welcome() {
        return "Spring Boot application is running";
    }
}