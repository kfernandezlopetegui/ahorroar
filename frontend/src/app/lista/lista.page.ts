import { Component, signal } from '@angular/core';
import {
  IonContent, IonHeader, IonToolbar, IonTitle,
  IonButton, IonIcon, IonSpinner, IonText,
  IonCard, IonCardContent, IonChip, IonBadge,
  IonItem, IonLabel, IonNote,
  ToastController,
} from '@ionic/angular/standalone';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { addIcons } from 'ionicons';
import {
  trashOutline, addOutline, removeOutline,
  cartOutline, locationOutline, calculatorOutline,
  checkmarkCircleOutline, alertCircleOutline,
} from 'ionicons/icons';
import { ListaService } from '../core/services/lista';
import { Geolocation } from '@capacitor/geolocation';

@Component({
  selector: 'app-lista',
  standalone: true,
  imports: [
    DecimalPipe, RouterLink,
    IonContent, IonHeader, IonToolbar, IonTitle,
    IonButton, IonIcon, IonSpinner, IonText,
    IonCard, IonCardContent, IonChip, IonBadge,

  ],
  templateUrl: './lista.page.html',
})
export class ListaPage {
  userLat = signal<number | null>(null);
  userLng = signal<number | null>(null);
  usandoUbicacion = signal(false);

  get items()      { return this.lista.items; }
  get resultado()  { return this.lista.resultado; }
  get calculando() { return this.lista.calculando; }
  get error()      { return this.lista.errorCalculo; }
  get total()      { return this.lista.totalItems; }

  constructor(
    public readonly lista: ListaService,
    private readonly toastCtrl: ToastController,
  ) {
    addIcons({
      trashOutline, addOutline, removeOutline,
      cartOutline, locationOutline, calculatorOutline,
      checkmarkCircleOutline, alertCircleOutline,
    });
  }

  cambiarCantidad(id: string, delta: number) {
    const item = this.items().find(i => i.producto.id === id);
    if (item) this.lista.cambiarCantidad(id, item.cantidad + delta);
  }

  async activarUbicacion() {
    try {
      const perm = await Geolocation.requestPermissions();
      if (perm.location !== 'granted') {
        const t = await this.toastCtrl.create({ message: 'Permiso denegado', duration: 2000, color: 'warning' });
        await t.present(); return;
      }
      const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 10000 });
      this.userLat.set(pos.coords.latitude);
      this.userLng.set(pos.coords.longitude);
      this.usandoUbicacion.set(true);
      const t = await this.toastCtrl.create({ message: '📍 Ubicación activada', duration: 1500, color: 'primary' });
      await t.present();
    } catch {
      const t = await this.toastCtrl.create({ message: 'No se pudo obtener la ubicación', duration: 2000, color: 'warning' });
      await t.present();
    }
  }

  async calcular() {
    if (!this.items().length) return;
    await this.lista.calcularMejorSuper(
      this.userLat() ?? undefined,
      this.userLng() ?? undefined,
    );
  }

  limpiar() {
    this.lista.limpiar();
  }
}