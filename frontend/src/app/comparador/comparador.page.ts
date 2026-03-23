import { Component, signal, computed } from '@angular/core';
import {
  IonContent, IonHeader, IonToolbar, IonTitle,
  IonSearchbar, IonCard, IonCardContent,
  IonButton, IonIcon, IonSpinner, IonText,
  IonChip, IonSegment, IonSegmentButton, IonLabel,
  IonItem, IonInput, IonFab, IonFabButton,
  ToastController, ModalController,
} from '@ionic/angular/standalone';
import { DecimalPipe, TitleCasePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { addIcons } from 'ionicons';
import {
  locationOutline, scanOutline, searchOutline,
  barcodeOutline, cameraOutline, trendingDownOutline,
} from 'ionicons/icons';
import { PreciosClarosService, PCProducto } from '../core/services/precios-claros';
import { ScannerComponent } from '../shared/scanner/scanner.component';

type SearchMode = 'nombre' | 'ean';

@Component({
  selector: 'app-comparador',
  standalone: true,
  imports: [
    FormsModule, DecimalPipe, TitleCasePipe,
    IonContent, IonHeader, IonToolbar, IonTitle,
    IonSearchbar, IonCard, IonCardContent,
    IonButton, IonIcon, IonSpinner, IonText,
    IonChip, IonSegment, IonSegmentButton,
    IonLabel, IonItem, IonInput,
    IonFab, IonFabButton,
  ],
  templateUrl: './comparador.page.html',
})
export class ComparadorPage {
  searchMode           = signal<SearchMode>('nombre');
  eanInput             = signal('');
  productoSeleccionado = signal<PCProducto | null>(null);
  userLat              = signal<number | null>(null);
  userLng              = signal<number | null>(null);
  usandoUbicacion      = signal(false);

  mejorPrecio = computed(() => {
    const lista = this.pc.precios();
    if (!lista.length) return null;
    return [...lista].sort(
      (a, b) =>
        (a.preciosProducto?.precioLista ?? 99999) -
        (b.preciosProducto?.precioLista ?? 99999),
    )[0];
  });

  get productos()        { return this.pc.productos; }
  get precios()          { return this.pc.precios; }
  get loadingProductos() { return this.pc.loadingProductos; }
  get loadingPrecios()   { return this.pc.loadingPrecios; }
  get error()            { return this.pc.error; }

  constructor(
    public readonly pc: PreciosClarosService,
    private readonly toastCtrl: ToastController,
    private readonly modalCtrl: ModalController,
  ) {
    addIcons({
      locationOutline, scanOutline, searchOutline,
      barcodeOutline, cameraOutline, trendingDownOutline,
    });
  }

  onSegmentChange(event: any) {
    this.searchMode.set(event.detail.value as SearchMode);
    this.resetResultados();
  }

  async onSearch(event: any) {
    const query: string = event.detail.value ?? '';
    if (query.length < 3) return;
    this.resetResultados();
    await this.pc.buscarProductos(
      query,
      this.userLat() ?? undefined,
      this.userLng() ?? undefined,
    );
  }

  async buscarPorEAN() {
    const ean = this.eanInput().trim();
    if (!ean) return;
    this.resetResultados();
    const producto = await this.pc.buscarPorEAN(
      ean,
      this.userLat() ?? undefined,
      this.userLng() ?? undefined,
    );
    if (producto) this.productoSeleccionado.set(producto);
  }

  async abrirEscaner() {
    const modal = await this.modalCtrl.create({
      component: ScannerComponent,
      cssClass: 'scanner-modal',
    });
    await modal.present();

    const { data } = await modal.onDidDismiss<{ ean: string } | null>();

    if (data?.ean) {
      this.searchMode.set('ean');
      this.eanInput.set(data.ean);
      this.resetResultados();

      const producto = await this.pc.buscarPorEAN(
        data.ean,
        this.userLat() ?? undefined,
        this.userLng() ?? undefined,
      );
      if (producto) {
        this.productoSeleccionado.set(producto);
      } else {
        const toast = await this.toastCtrl.create({
          message: `Código ${data.ean} no encontrado en Precios Claros.`,
          duration: 3000,
          color: 'warning',
        });
        await toast.present();
      }
    }
  }

  async seleccionarProducto(producto: PCProducto) {
    this.productoSeleccionado.set(producto);
    this.pc.precios.set([]);
    await this.pc.buscarPrecios(
      producto.id,
      this.userLat() ?? undefined,
      this.userLng() ?? undefined,
    );
  }

  async usarUbicacion() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        this.userLat.set(pos.coords.latitude);
        this.userLng.set(pos.coords.longitude);
        this.usandoUbicacion.set(true);
        if (this.productoSeleccionado()) {
          await this.pc.buscarPrecios(
            this.productoSeleccionado()!.id,
            pos.coords.latitude,
            pos.coords.longitude,
          );
        }
      },
      async () => {
        const toast = await this.toastCtrl.create({
          message: 'No se pudo obtener la ubicación.',
          duration: 2000,
          color: 'warning',
        });
        await toast.present();
      },
    );
  }

  volverAResultados() {
    this.productoSeleccionado.set(null);
    this.pc.precios.set([]);
  }

  private resetResultados() {
    this.productoSeleccionado.set(null);
    this.pc.productos.set([]);
    this.pc.precios.set([]);
    this.pc.error.set('');
  }
}