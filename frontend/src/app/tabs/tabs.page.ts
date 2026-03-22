import { Component } from '@angular/core';
import { IonTabs, IonTabBar, IonTabButton,
         IonIcon, IonLabel } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { homeOutline, personOutline, ticketOutline, searchOutline } from 'ionicons/icons';

@Component({
  selector: 'app-tabs',
  standalone: true,
  imports: [IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel],
  templateUrl: './tabs.page.html'
})
export class TabsPage {
  constructor() {
    addIcons({ homeOutline, personOutline, ticketOutline, searchOutline});
  }
}