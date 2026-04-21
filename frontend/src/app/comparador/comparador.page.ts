import { Component, signal, computed, OnDestroy } from '@angular/core';
import {
  IonContent, IonHeader, IonToolbar, IonTitle,
  IonSearchbar, IonCard, IonCardContent,
  IonButton, IonIcon, IonSpinner, IonText,
  IonChip, IonSegment, IonSegmentButton, IonLabel,
  IonItem, IonInput, IonBadge,
  ToastController, ModalController, AlertController,
} from '@ionic/angular/standalone';
import { DecimalPipe, TitleCasePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { addIcons } from 'ionicons';
import {
  locationOutline, scanOutline, searchOutline,
  barcodeOutline, cameraOutline, trendingDownOutline,
  timeOutline, cartOutline, eyeOutline,
} from 'ionicons/icons';
import { Geolocation } from '@capacitor/geolocation';
import { Platform } from '@ionic/angular/standalone';
import { PreciosClarosService, PCProducto } from '../core/services/precios-claros';
import { ScannerComponent } from '../shared/scanner/scanner.component';
import { PriceChartComponent } from '../shared/price-chart/price-chart.component';
import { ListaService } from '../core/services/lista';
import { WatchlistService } from '../core/services/watchlist';

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
    IonLabel, IonItem, IonInput, IonBadge,
    PriceChartComponent,
  ],
  templateUrl: './comparador.page.html',
})
export class ComparadorPage implements OnDestroy {
  searchMode           = signal<SearchMode>('nombre');
  eanInput             = signal('');
  productoSeleccionado = signal<PCProducto | null>(null);
  userLat              = signal<number | null>(null);
  userLng              = signal<number | null>(null);
  usandoUbicacion      = signal(false);
  mostrarHistorial     = signal(false);

  mejorPrecio = computed(() => {
    const lista = this.pc.precios();
    if (!lista.length) return null;
    return [...lista].sort(
      (a, b) =>
        (a.preciosProducto?.precioLista ?? 99999) -
        (b.preciosProducto?.precioLista ?? 99999),
    )[0];
  });

  get productos()         { return this.pc.productos; }
  get precios()           { return this.pc.precios; }
  get historial()         { return this.pc.historial; }
  get supermarketOffers() { return this.pc.supermarketOffers; }
  get loadingProductos()  { return this.pc.loadingProductos; }
  get loadingPrecios()    { return this.pc.loadingPrecios; }
  get loadingHistorial()  { return this.pc.loadingHistorial; }
  get error()             { return this.pc.error; }

  constructor(
    public  readonly pc:         PreciosClarosService,
    public  readonly lista:      ListaService,
    public  readonly watchlist:  WatchlistService,
    private readonly toastCtrl:  ToastController,
    private readonly modalCtrl:  ModalController,
    private readonly platform:   Platform,
    private readonly alertCtrl:  AlertController,
  ) {
    addIcons({
      locationOutline, scanOutline, searchOutline,
      barcodeOutline, cameraOutline, trendingDownOutline,
      timeOutline, cartOutline, eyeOutline,
    });
    this.watchlist.load();
  }

  ngOnDestroy() {
    this.pc.historial.set([]);
    this.pc.supermarketOffers.set([]);
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
    if (producto) {
      this.productoSeleccionado.set(producto);
      await this.pc.getHistorial(ean);
    }
  }

  async abrirEscaner() {
    const modal = await this.modalCtrl.create({
      component: ScannerComponent,
      cssClass:  'scanner-modal',
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
        await this.pc.getHistorial(data.ean);
      } else {
        const toast = await this.toastCtrl.create({
          message:  `Código ${data.ean} no encontrado en Precios Claros.`,
          duration: 3000,
          color:    'warning',
        });
        await toast.present();
      }
    }
  }

  async seleccionarProducto(producto: PCProducto) {
    this.productoSeleccionado.set(producto);
    this.pc.precios.set([]);
    this.pc.supermarketOffers.set([]);
    this.mostrarHistorial.set(false);
    await Promise.all([
      this.pc.buscarPrecios(
        producto.id,
        this.userLat() ?? undefined,
        this.userLng() ?? undefined,
      ),
      this.pc.getHistorial(producto.id),
    ]);
  }

  async agregarALista(producto: PCProducto) {
    this.lista.agregarItem(producto);
    const toast = await this.toastCtrl.create({
      message:  `${producto.nombre} agregado a la lista`,
      duration: 2000,
      color:    'success',
    });
    await toast.present();
  }

  async usarUbicacion() {
    try {
      const perm = await Geolocation.requestPermissions();
      if (perm.location !== 'granted') {
        const toast = await this.toastCtrl.create({
          message: 'Permiso de ubicación denegado.',
          duration: 2500,
          color:   'warning',
        });
        await toast.present();
        return;
      }

      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout:            10000,
      });

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

      const toast = await this.toastCtrl.create({
        message:  '📍 Ubicación activada',
        duration: 1500,
        color:    'primary',
      });
      await toast.present();
    } catch {
      const toast = await this.toastCtrl.create({
        message:  'No se pudo obtener la ubicación.',
        duration: 2000,
        color:    'warning',
      });
      await toast.present();
    }
  }

  volverAResultados() {
    this.productoSeleccionado.set(null);
    this.pc.precios.set([]);
    this.pc.historial.set([]);
    this.pc.supermarketOffers.set([]);
    this.mostrarHistorial.set(false);
  }

  toggleHistorial() {
    this.mostrarHistorial.update(v => !v);
  }

  async seguirPrecio(producto: PCProducto) {
    const watching = this.watchlist.getItem(producto.id);
    const alert = await this.alertCtrl.create({
      header:    watching ? 'Actualizar alerta' : 'Seguir precio',
      subHeader: producto.nombre,
      inputs: [
        {
          type:    'radio',
          label:   '🏷️ Cualquier oferta (2x1, % desc, etc.)',
          value:   'promo',
          checked: watching ? watching.alert_on_promo : true,
        },
        {
          type:    'radio',
          label:   '🎯 Cuando baje de un precio',
          value:   'precio',
          checked: watching ? !watching.alert_on_promo : false,
        },
      ],
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Siguiente',
          handler: async (mode: 'promo' | 'precio') => {
            if (mode === 'promo') {
              await this.watchlist.followPromo(producto.id, producto.nombre);
              const t = await this.toastCtrl.create({
                message:  '✅ Te avisamos cuando aparezca cualquier oferta',
                duration: 2500,
                color:    'success',
              });
              await t.present();
            } else {
              await this.askPrecioObjetivo(producto);
            }
          },
        },
      ],
    });
    await alert.present();
  }

  private async askPrecioObjetivo(producto: PCProducto) {
    const watching = this.watchlist.getItem(producto.id);
    const alert = await this.alertCtrl.create({
      header:    'Precio objetivo',
      subHeader: producto.nombre,
      inputs: [{
        name:        'precio',
        type:        'number',
        placeholder: 'Ej: 1500',
        value:       watching?.precio_objetivo ? String(watching.precio_objetivo) : '',
      }],
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Guardar',
          handler: async (val) => {
            const precio = parseFloat(val.precio);
            if (!precio || precio <= 0) return;
            await this.watchlist.followPrecio(producto.id, producto.nombre, precio);
            const t = await this.toastCtrl.create({
              message:  `✅ Te avisamos cuando baje de $${precio.toLocaleString('es-AR')}`,
              duration: 2500,
              color:    'success',
            });
            await t.present();
          },
        },
      ],
    });
    await alert.present();
  }

  private resetResultados() {
    this.productoSeleccionado.set(null);
    this.pc.productos.set([]);
    this.pc.precios.set([]);
    this.pc.historial.set([]);
    this.pc.supermarketOffers.set([]);
    this.pc.error.set('');
    this.mostrarHistorial.set(false);
  }
}