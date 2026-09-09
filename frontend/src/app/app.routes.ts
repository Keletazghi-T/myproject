import { Component, inject } from '@angular/core';
import { CanActivateFn, Router, Routes } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from './auth.service';
import { DashboardComponent } from './dashboard';
import { MessagesComponent } from './messages';
import { MeetingComponent } from './meeting';

@Component({ selector: 'app-home', template: '' })
class HomeComponent {}

const authGuard: CanActivateFn = () => {
  const router = inject(Router);
  return inject(AuthService).load().pipe(map(loggedIn => loggedIn ? true : router.createUrlTree(['/'])));
};
const homeGuard: CanActivateFn = () => {
  const router = inject(Router);
  return inject(AuthService).load().pipe(map(loggedIn => loggedIn ? router.createUrlTree(['/dashboard']) : true));
};

export const routes: Routes = [
  { path: 'messages/:memberId', component: MessagesComponent, canActivate: [authGuard] },
  { path: 'voice', component: HomeComponent, canActivate: [authGuard] },
  { path: 'dashboard', component: DashboardComponent, canActivate: [authGuard] },
  { path: 'meeting/:id', component: MeetingComponent, canActivate: [authGuard] },
  { path: '', component: HomeComponent, canActivate: [homeGuard] },
  { path: '**', redirectTo: '' }
];
