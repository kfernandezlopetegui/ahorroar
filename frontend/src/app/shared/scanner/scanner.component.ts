import { Component, signal, OnDestroy } from '@angular/core';
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
  scannerEnabled = signal(false); // empieza en false hasta tener permiso
  isNative       = signal(false);

  allowedFormats = [
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.UPC_A,
    BarcodeFormat.UPC_E,
    BarcodeFormat.CODE_128,
  ];

  constructor(
    private readonly modalCtrl: ModalController,
    private readonly platform: Platform,
  ) {
    addIcons({ closeOutline, cameraOutline });
    this.isNative.set(this.platform.is('capacitor'));
    this.solicitarPermiso();
  }

  private async solicitarPermiso() {
    if (this.platform.is('capacitor')) {
      // Permiso nativo con Capacitor
      try {
        const status = await Camera.requestPermissions({ permissions: ['camera'] });
        const granted = status.camera === 'granted';
        this.hasPermission.set(granted);
        this.scannerEnabled.set(granted);
      } catch {
        this.hasPermission.set(false);
      }
    } else {
      // En web/PWA lo maneja zxing directamente
      this.scannerEnabled.set(true);
    }
  }

  onPermissionResponse(permission: boolean) {
    this.hasPermission.set(permission);
    if (!permission) this.scannerEnabled.set(false);
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
    this.scannerEnabled.set(false);
  }
}