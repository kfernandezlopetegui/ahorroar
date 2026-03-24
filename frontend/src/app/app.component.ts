import { Component, OnInit } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';
import { PushNotificationsService } from './core/services/notifications';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  imports: [IonApp, IonRouterOutlet],
})
export class AppComponent implements OnInit {
  constructor(private push: PushNotificationsService) {}

  ngOnInit() {
    this.push.init();
  }
}