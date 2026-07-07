import { Component, signal, OnDestroy, ElementRef } from '@angular/core';
import { ZXingScannerModule } from '@zxing/ngx-scanner';
import { BarcodeFormat } from '@zxing/library';
import {
  IonHeader, IonToolbar, IonTitle, IonButton,
  IonIcon, IonContent, IonSpinner,
  ModalController, Platform,
} from '@ionic/angular/standalone';
import { Camera } from '@capacitor/camera';
import { addIcons } from 'ionicons';
import { closeOutline, cameraOutline } from 'ionicons/icons';

@Component({
  selector: 'app-scanner',
  standalone: true,
  imports: [
    ZXingScannerModule,
    IonHeader, IonToolbar, IonTitle, IonButton,
    IonIcon, IonContent, IonSpinner,
  ],
  templateUrl: './scanner.component.html',
  styleUrls: ['./scanner.component.scss'],
})
export class ScannerComponent implements OnDestroy {
  hasPermission  = signal<boolean | null>(null);
  scannerEnabled = signal(false);
  camaraLista    = signal(false); // el video queda oculto hasta que el stream arranca

  allowedFormats = [
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.UPC_A,
    BarcodeFormat.UPC_E,
    BarcodeFormat.CODE_128,
  ];

  private videoWatchTimer?: ReturnType<typeof setTimeout>;
  private destruido = false;

  constructor(
    private readonly modalCtrl: ModalController,
    private readonly platform: Platform,
    private readonly host: ElementRef<HTMLElement>,
  ) {
    addIcons({ closeOutline, cameraOutline });
    this.solicitarPermiso();
  }

  private async solicitarPermiso() {
    if (this.platform.is('capacitor')) {
      try {
        const status = await Camera.requestPermissions({ permissions: ['camera'] });
        const granted = status.camera === 'granted';
        this.hasPermission.set(granted);
        this.scannerEnabled.set(granted);
      } catch {
        this.hasPermission.set(false);
      }
    } else {
      // En web el permiso lo pide el propio <zxing-scanner> vía getUserMedia:
      // habilitamos el scanner y esperamos su (permissionResponse).
      this.hasPermission.set(true);
      this.scannerEnabled.set(true);
    }
  }

  onCamerasFound(cameras: MediaDeviceInfo[]) {
    // Hay cámara, pero el stream todavía puede tardar en arrancar:
    // esperamos a que el <video> esté reproduciendo para mostrarlo
    // (si se muestra antes aparece el placeholder de video roto).
    if (cameras?.length) this.esperarVideoListo();
  }

  onCamerasNotFound() {
    this.hasPermission.set(false);
  }

  onPermissionResponse(permission: boolean) {
    this.hasPermission.set(permission);
    if (!permission) this.scannerEnabled.set(false);
  }

  private esperarVideoListo(intentos = 0) {
    if (this.destruido || this.camaraLista()) return;

    const video = this.host.nativeElement.querySelector('video');
    if (video) {
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && !video.paused) {
        this.camaraLista.set(true);
        return;
      }
      video.addEventListener('playing', () => this.camaraLista.set(true), { once: true });
      // Red de seguridad: si 'playing' nunca llega, mostrar igual a los 4s
      this.videoWatchTimer = setTimeout(() => this.camaraLista.set(true), 4000);
      return;
    }

    if (intentos < 50) {
      this.videoWatchTimer = setTimeout(() => this.esperarVideoListo(intentos + 1), 100);
    } else {
      this.camaraLista.set(true);
    }
  }

  onScanSuccess(result: string) {
    if (!result) return;
    this.scannerEnabled.set(false);
    this.modalCtrl.dismiss({ ean: result });
  }

  cerrar() {
    this.scannerEnabled.set(false);
    this.modalCtrl.dismiss(null);
  }

  ngOnDestroy() {
    this.destruido = true;
    if (this.videoWatchTimer) clearTimeout(this.videoWatchTimer);
    this.scannerEnabled.set(false);
  }
}
