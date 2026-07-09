import { Component, signal, computed, OnDestroy } from '@angular/core';
import {
  IonContent, IonHeader, IonToolbar, IonTitle,
  IonSearchbar, IonCard, IonCardContent,
  IonButton, IonIcon, IonSpinner, IonChip, IonSegment, IonSegmentButton, IonLabel,
  IonItem, IonInput, IonBadge,
  ToastController, ModalController, AlertController,
} from '@ionic/angular/standalone';
import { DecimalPipe, TitleCasePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { addIcons } from 'ionicons';
import {
  locationOutline, scanOutline, searchOutline,
  barcodeOutline, cameraOutline, trendingDownOutline,
  timeOutline, cartOutline, eyeOutline, chevronBackOutline,
  checkmarkCircleOutline, restaurantOutline,
} from 'ionicons/icons';
import { Geolocation } from '@capacitor/geolocation';
import { Platform } from '@ionic/angular/standalone';
import { environment } from '../../environments/environment';
import { PreciosClarosService, PCProducto } from '../core/services/precios-claros';
import { ScannerComponent } from '../shared/scanner/scanner.component';
import { PriceChartComponent } from '../shared/price-chart/price-chart.component';
import { ListaService } from '../core/services/lista';
import { WatchlistService } from '../core/services/watchlist';
import { MeatCutsService, MeatCutSummary } from '../core/services/meat-cuts';

type SearchMode = 'nombre' | 'ean' | 'carnes';

const PLACEHOLDER_IMG = 'assets/img/product-placeholder.svg';

@Component({
  selector: 'app-comparador',
  standalone: true,
  imports: [
    FormsModule, DecimalPipe, TitleCasePipe,
    IonContent, IonHeader, IonToolbar, IonTitle,
    IonSearchbar, IonCard, IonCardContent,
    IonButton, IonIcon, IonSpinner, IonChip, IonSegment, IonSegmentButton,
    IonLabel, IonItem, IonInput, IonBadge,
    PriceChartComponent,
  ],
  templateUrl: './comparador.page.html',
})
export class ComparadorPage implements OnDestroy {
  searchMode           = signal<SearchMode>('nombre');
  eanInput             = signal('');
  productoSeleccionado = signal<PCProducto | null>(null);
  corteSeleccionado    = signal<MeatCutSummary | null>(null);
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
  get onlinePrices()      { return this.pc.onlinePrices; }
  get loadingProductos()  { return this.pc.loadingProductos; }
  get loadingPrecios()    { return this.pc.loadingPrecios; }
  get loadingHistorial()  { return this.pc.loadingHistorial; }
  get error()             { return this.pc.error; }

  constructor(
    public  readonly pc:         PreciosClarosService,
    public  readonly meat:       MeatCutsService,
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
      timeOutline, cartOutline, eyeOutline, chevronBackOutline,
      checkmarkCircleOutline, restaurantOutline,
    });
    this.watchlist.load();
  }

  ngOnDestroy() {
    this.pc.historial.set([]);
    this.pc.supermarketOffers.set([]);
    this.pc.onlinePrices.set([]);
  }

  /**
   * Imagen del producto: si vino de un scraper o fuente online usa esa URL;
   * si no, el proxy del backend, que resuelve Precios Claros
   * (imagenes.preciosclaros.gob.ar/productos/{EAN}.jpg) y evita el bloqueo
   * de hotlinking. Si tampoco hay, (error) muestra el placeholder local.
   */
  imgSrc(producto: PCProducto): string {
    return producto.imagen || `${environment.apiUrl}/products/${producto.id}/image`;
  }

  onImgError(event: Event) {
    const img = event.target as HTMLImageElement;
    if (!img.src.endsWith(PLACEHOLDER_IMG)) img.src = PLACEHOLDER_IMG;
  }

  onSegmentChange(event: any) {
    this.searchMode.set(event.detail.value as SearchMode);
    this.resetResultados();
    if (this.searchMode() === 'carnes' && !this.meat.cuts().length) {
      this.meat.loadCuts();
    }
  }

  // ── Sección Carnes: comparación por corte a $/kg ──────────────────────────

  async seleccionarCorte(corte: MeatCutSummary) {
    this.corteSeleccionado.set(corte);
    await this.meat.loadDetail(corte.slug);
  }

  volverACortes() {
    this.corteSeleccionado.set(null);
    this.meat.detail.set(null);
    this.meat.loadCuts(); // refresca los mínimos al volver a la grilla
  }

  /** "hace 3 h" / "hace 20 min" para el scraped_at de cada fila */
  haceCuanto(iso: string): string {
    const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    if (mins < 60) return `hace ${mins} min`;
    const hs = Math.round(mins / 60);
    return `hace ${hs} h`;
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
    const ean = this.eanInput().trim().replace(/\D/g, '');
    if (ean.length < 8) return;
    this.resetResultados();
    const producto = await this.pc.buscarPorEAN(
      ean,
      this.userLat() ?? undefined,
      this.userLng() ?? undefined,
    );
    if (producto) {
      this.productoSeleccionado.set(producto);
      await this.pc.getHistorial(producto.id);
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
      const ean = data.ean.trim().replace(/\D/g, '');
      this.searchMode.set('ean');
      this.eanInput.set(ean);
      this.resetResultados();
      const producto = await this.pc.buscarPorEAN(
        ean,
        this.userLat() ?? undefined,
        this.userLng() ?? undefined,
      );
      if (producto) {
        this.productoSeleccionado.set(producto);
        await this.pc.getHistorial(producto.id);
      } else if (!this.pc.supermarketOffers().length && !this.pc.onlinePrices().length) {
        const toast = await this.toastCtrl.create({
          message:  `Código ${ean} no encontrado en ninguna fuente.`,
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
    this.pc.onlinePrices.set([]);
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
        message:  'Ubicación activada',
        icon:     'location-outline',
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
    this.pc.onlinePrices.set([]);
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
          label:   'Cualquier oferta (2x1, % desc, etc.)',
          value:   'promo',
          checked: watching ? watching.alert_on_promo : true,
        },
        {
          type:    'radio',
          label:   'Cuando baje de un precio',
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
                message:  'Te avisamos cuando aparezca cualquier oferta',
                icon:     'checkmark-circle-outline',
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
              message:  `Te avisamos cuando baje de $${precio.toLocaleString('es-AR')}`,
              icon:     'checkmark-circle-outline',
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
    this.corteSeleccionado.set(null);
    this.meat.detail.set(null);
    this.pc.productos.set([]);
    this.pc.precios.set([]);
    this.pc.historial.set([]);
    this.pc.supermarketOffers.set([]);
    this.pc.onlinePrices.set([]);
    this.pc.error.set('');
    this.mostrarHistorial.set(false);
  }
}