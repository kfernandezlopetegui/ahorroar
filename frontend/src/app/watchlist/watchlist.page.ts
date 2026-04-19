import { Component, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  IonContent, IonHeader, IonToolbar, IonTitle,
  IonButton, IonIcon, IonSpinner,
  IonCard, IonCardContent, IonChip, IonBadge,
  ToastController, AlertController,
} from '@ionic/angular/standalone';
import { DecimalPipe } from '@angular/common';
import { addIcons } from 'ionicons';
import {
  trashOutline, eyeOutline, trendingDownOutline,
  notificationsOutline, pricetagOutline, createOutline,
} from 'ionicons/icons';
import { WatchlistService, WatchlistItem } from '../core/services/watchlist';

@Component({
  selector: 'app-watchlist',
  standalone: true,
  imports: [
    DecimalPipe, RouterLink,
    IonContent, IonHeader, IonToolbar, IonTitle,
    IonButton, IonIcon, IonSpinner,
    IonCard, IonCardContent, IonChip,
  ],
  templateUrl: './watchlist.page.html',
})
export class WatchlistPage implements OnInit {
  get items()   { return this.svc.items; }
  get loading() { return this.svc.loading; }

  constructor(
    public svc: WatchlistService,
    private toastCtrl: ToastController,
    private alertCtrl: AlertController,
  ) {
    addIcons({ trashOutline, eyeOutline, trendingDownOutline,
               notificationsOutline, pricetagOutline, createOutline });
  }

  ngOnInit() { this.svc.load(); }

  async editAlert(item: WatchlistItem) {
    const alert = await this.alertCtrl.create({
      header: 'Tipo de alerta',
      subHeader: item.producto_nombre,
      inputs: [
        {
          type: 'radio',
          label: '🏷️ Cualquier oferta (2x1, % desc, etc.)',
          value: 'promo',
          checked: item.alert_on_promo,
        },
        {
          type: 'radio',
          label: '🎯 Cuando baje de un precio',
          value: 'precio',
          checked: !item.alert_on_promo,
        },
      ],
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Siguiente',
          handler: async (mode: 'promo' | 'precio') => {
            if (mode === 'promo') {
              await this.svc.updateAlertMode(item, 'promo');
              this.showToast('✅ Alerta activada para cualquier oferta');
            } else {
              await this.askPrecioObjetivo(item);
            }
          },
        },
      ],
    });
    await alert.present();
  }

  private async askPrecioObjetivo(item: WatchlistItem) {
    const alert = await this.alertCtrl.create({
      header: 'Precio objetivo',
      subHeader: item.producto_nombre,
      inputs: [{
        name: 'precio',
        type: 'number',
        placeholder: 'Ej: 1500',
        value: item.precio_objetivo ? String(item.precio_objetivo) : '',
      }],
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Guardar',
          handler: async (val) => {
            const precio = parseFloat(val.precio);
            if (!precio || precio <= 0) return;
            await this.svc.updateAlertMode(item, 'precio', precio);
            this.showToast(`✅ Te avisamos cuando baje de $${precio.toLocaleString('es-AR')}`);
          },
        },
      ],
    });
    await alert.present();
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
            this.showToast('Eliminado de alertas');
          },
        },
      ],
    });
    await alert.present();
  }

  timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `hace ${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `hace ${hrs}h`;
    return `hace ${Math.floor(hrs / 24)}d`;
  }

  private async showToast(message: string) {
    const t = await this.toastCtrl.create({ message, duration: 2500, color: 'success', position: 'top' });
    await t.present();
  }
}