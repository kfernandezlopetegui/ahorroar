import { Component, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  IonContent, IonHeader, IonToolbar, IonTitle,
  IonButton, IonIcon, IonSpinner, IonText,
  IonCard, IonCardContent, IonChip, IonModal,
  IonItem, IonLabel, IonInput,
  ToastController, AlertController,
} from '@ionic/angular/standalone';
import { DecimalPipe } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { addIcons } from 'ionicons';
import { trashOutline, pricetagOutline, eyeOutline, trendingDownOutline, cartOutline } from 'ionicons/icons';
import { WatchlistService, WatchlistItem } from '../core/services/watchlist';

@Component({
  selector: 'app-watchlist',
  standalone: true,
  imports: [
    DecimalPipe, RouterLink, ReactiveFormsModule,
    IonContent, IonHeader, IonToolbar, IonTitle,
    IonButton, IonIcon, IonSpinner,
    IonCard, IonCardContent, IonChip, IonModal,
    IonItem, IonLabel, IonInput,
  ],
  templateUrl: './watchlist.page.html',
})
export class WatchlistPage implements OnInit {
  editItem   = signal<WatchlistItem | null>(null);
  isModalOpen = signal(false);

  form = this.fb.group({
    precio_objetivo: [null as number | null, [Validators.required, Validators.min(1)]],
  });

  get items()   { return this.svc.items; }
  get loading() { return this.svc.loading; }

  constructor(
    public svc: WatchlistService,
    private fb: FormBuilder,
    private toastCtrl: ToastController,
    private alertCtrl: AlertController,
  ) {
    addIcons({ trashOutline, pricetagOutline, eyeOutline, trendingDownOutline, cartOutline });
  }

  ngOnInit() { this.svc.load(); }

  openEdit(item: WatchlistItem) {
    this.editItem.set(item);
    this.form.patchValue({ precio_objetivo: item.precio_objetivo });
    this.isModalOpen.set(true);
  }

  async saveEdit() {
    const item = this.editItem();
    if (!item || this.form.invalid) return;
    await this.svc.upsert(item.ean, item.producto_nombre, this.form.value.precio_objetivo!);
    this.isModalOpen.set(false);
    const t = await this.toastCtrl.create({ message: 'Precio objetivo actualizado', duration: 2000, color: 'success' });
    await t.present();
  }

  async confirmRemove(item: WatchlistItem) {
    const alert = await this.alertCtrl.create({
      header: 'Dejar de seguir',
      message: `¿Dejás de seguir "${item.producto_nombre}"?`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Eliminar', role: 'destructive',
          handler: async () => {
            await this.svc.remove(item.id);
            const t = await this.toastCtrl.create({ message: 'Eliminado de watchlist', duration: 2000 });
            await t.present();
          },
        },
      ],
    });
    await alert.present();
  }
}