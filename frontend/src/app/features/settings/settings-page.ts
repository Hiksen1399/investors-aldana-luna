import { Component, inject } from '@angular/core';
import { AuthService } from '../../core/auth.service';

@Component({selector:'app-settings-page',templateUrl:'./settings-page.html',styleUrl:'./settings-page.scss'})
export class SettingsPage{readonly auth=inject(AuthService)}

