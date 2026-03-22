import { Component, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  IonContent, IonHeader, IonToolbar, IonTitle,
  IonButton, IonIcon, IonItem, IonLabel,
  IonList, IonListHeader, IonSelect, IonSelectOption,
  IonSpinner, IonText, IonItemSliding,
  IonItemOptions, IonItemOption, IonNote,
  AlertController
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { addOutline, trashOutline, cardOutline, logOutOutline } from 'ionicons/icons';
import { CardsService, BANKS } from '../core/services/cards';
import { AuthService } from '../core/services/auth';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [
    IonContent, IonHeader, IonToolbar, IonTitle,
    IonButton, IonIcon, IonItem, IonLabel,
    IonList, IonListHeader, IonSelect, IonSelectOption,
    IonSpinner, IonText, IonItemSliding,
    IonItemOptions, IonItemOption, IonNote
  ],
  templateUrl: './profile.page.html',
})
export class ProfilePage implements OnInit {
  banks = BANKS;
  selectedBank = signal('');
  selectedCard = signal('');
  adding = signal(false);
  errorMsg = signal('');

  availableCards = signal<string[]>([]);

  get userCards() { return this.cardsSvc.userCards; }
  get loading() { return this.cardsSvc.loading; }
  get userEmail() { return this.auth.currentUser()?.email ?? ''; }

  constructor(
    public cardsSvc: CardsService,
    public auth: AuthService,
    private router: Router,
    private alertCtrl: AlertController
  ) {
    addIcons({ addOutline, trashOutline, cardOutline, logOutOutline });
  }

  ngOnInit() {
    this.cardsSvc.loadCards();
  }

  onBankChange(event: any) {
    const bank = event.detail.value;
    this.selectedBank.set(bank);
    const found = this.banks.find(b => b.bank === bank);
    this.availableCards.set(found?.cards ?? []);
    this.selectedCard.set('');
  }

  async addCard() {
    if (!this.selectedBank() || !this.selectedCard()) return;
    this.adding.set(true);
    this.errorMsg.set('');
    try {
      await this.cardsSvc.addCard(this.selectedBank(), this.selectedCard());
      this.selectedBank.set('');
      this.selectedCard.set('');
      this.availableCards.set([]);
    } catch {
      this.errorMsg.set('No se pudo agregar la tarjeta.');
    } finally {
      this.adding.set(false);
    }
  }

  async confirmRemove(id: string, name: string) {
    const alert = await this.alertCtrl.create({
      header: 'Eliminar tarjeta',
      message: `¿Querés eliminar ${name}?`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Eliminar', role: 'destructive',
          handler: () => this.cardsSvc.removeCard(id) }
      ]
    });
    await alert.present();
  }

  async logout() {
    await this.auth.signOut();
  }
}