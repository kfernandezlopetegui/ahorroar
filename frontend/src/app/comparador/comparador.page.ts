import { Component, signal, computed } from '@angular/core';
import {
  IonContent, IonHeader, IonToolbar, IonTitle,
  IonSearchbar, IonCard, IonCardContent,
  IonButton, IonIcon, IonSpinner, IonText, IonChip
} from '@ionic/angular/standalone';
import { DecimalPipe } from '@angular/common';
import { addIcons } from 'ionicons';
import { locationOutline, scanOutline, starOutline } from 'ionicons/icons';
import { PreciosClarosService, PCProducto } from '../core/services/precios-claros';

@Component({
  selector: 'app-comparador',
  standalone: true,
  imports: [
    DecimalPipe,
    IonContent, IonHeader, IonToolbar, IonTitle,
    IonSearchbar, IonCard, IonCardContent,
    IonButton, IonIcon, IonSpinner, IonText, IonChip
  ],
  templateUrl: './comparador.page.html',
})
export class ComparadorPage {
  productoSeleccionado = signal<PCProducto | null>(null);
  userLat = signal<number | null>(null);
  userLng = signal<number | null>(null);
  usandoUbicacion = signal(false);

  mejorPrecio = computed(() => {
    const precios = this.pc.precios();
    if (!precios.length) return null;
    return [...precios].sort((a, b) => a.precio - b.precio)[0];
  });

  get productos() { return this.pc.productos; }
  get precios() { return this.pc.precios; }
  get loadingProductos() { return this.pc.loadingProductos; }
  get loadingPrecios() { return this.pc.loadingPrecios; }
  get error() { return this.pc.error; }

  constructor(public pc: PreciosClarosService) {
    addIcons({ locationOutline, scanOutline, starOutline });
  }

  async onSearch(event: any) {
    const query = event.detail.value ?? '';
    if (query.length < 3) return;
    this.productoSeleccionado.set(null);
    this.pc.precios.set([]);
    await this.pc.buscarProductos(
      query,
      this.userLat() ?? undefined,
      this.userLng() ?? undefined
    );
  }

  async seleccionarProducto(producto: PCProducto) {
    this.productoSeleccionado.set(producto);
    this.pc.precios.set([]);
    try {
      await this.pc.buscarPrecios(
        producto.id,
        this.userLat() ?? undefined,
        this.userLng() ?? undefined
      );
    } catch (e) {
      console.error('Error precios:', e);
    }
  }

  async usarUbicacion() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(async (pos) => {
      this.userLat.set(pos.coords.latitude);
      this.userLng.set(pos.coords.longitude);
      this.usandoUbicacion.set(true);
      if (this.productoSeleccionado()) {
        await this.pc.buscarPrecios(
          this.productoSeleccionado()!.id,
          pos.coords.latitude,
          pos.coords.longitude
        );
      }
    });
  }

  volverAResultados() {
    this.productoSeleccionado.set(null);
    this.pc.precios.set([]);
  }
}