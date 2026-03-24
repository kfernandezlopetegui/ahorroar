import { Component, OnInit, signal } from '@angular/core';
import {
  IonContent, IonHeader, IonToolbar, IonTitle,
  IonCard, IonCardContent, IonButton, IonIcon,
  IonSpinner, IonText, IonChip, IonBadge,
  IonSegment, IonSegmentButton, IonLabel,
  IonFab, IonFabButton, IonModal, IonItem, IonInput,
  IonSelect, IonSelectOption,
  ToastController,
} from '@ionic/angular/standalone';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { addIcons } from 'ionicons';
import {
  addOutline, thumbsUpOutline, trophyOutline,
  alertCircleOutline, personOutline,
} from 'ionicons/icons';
import { CommunityService, BADGE_INFO } from '../core/services/community';

@Component({
  selector: 'app-community',
  standalone: true,
  imports: [
    ReactiveFormsModule, DecimalPipe,
    IonContent, IonHeader, IonToolbar, IonTitle,
    IonCard, IonCardContent, IonButton, IonIcon,
    IonSpinner, IonText, IonChip, IonBadge,
    IonSegment, IonSegmentButton, IonLabel,
    IonFab, IonFabButton, IonModal, IonItem, IonInput,
    IonSelect, IonSelectOption
  ],
  templateUrl: './community.page.html',
})
export class CommunityPage implements OnInit {
  activeSegment = signal<'reportes' | 'ranking'>('reportes');
  isModalOpen   = signal(false);
  submitting    = signal(false);
  leaderboard   = signal<any[]>([]);
  badgeInfo     = BADGE_INFO;

  CADENAS = ['Carrefour', 'Coto', 'Disco', 'Jumbo', 'DIA', 'La Anónima', 'Vea', 'Walmart', 'Otro'];

  form = this.fb.group({
    ean:             ['', Validators.required],
    producto_nombre: ['', Validators.required],
    cadena:          ['', Validators.required],
    precio:          [null as number | null, [Validators.required, Validators.min(0.01)]],
    sucursal:        [''],
    direccion:       [''],
  });

  get reports()   { return this.svc.reports; }
  get loading()   { return this.svc.loading; }
  get error()     { return this.svc.error; }
  get userStats() { return this.svc.userStats; }

  constructor(
    public svc: CommunityService,
    private fb: FormBuilder,
    private toastCtrl: ToastController,
  ) {
    addIcons({ addOutline, thumbsUpOutline, trophyOutline, alertCircleOutline, personOutline });
  }

  ngOnInit() {
    this.svc.loadReports();
    this.svc.loadUserStats();
  }

  async onSegmentChange(event: any) {
    this.activeSegment.set(event.detail.value);
    if (event.detail.value === 'ranking' && !this.leaderboard().length) {
      this.leaderboard.set(await this.svc.loadLeaderboard());
    }
  }

  async upvote(id: string) {
    await this.svc.upvoteReport(id);
  }

  async submitReport() {
    if (this.form.invalid) return;
    this.submitting.set(true);
    try {
      await this.svc.createReport(this.form.value as any);
      this.isModalOpen.set(false);
      this.form.reset();
      const t = await this.toastCtrl.create({
        message: '✅ +10 puntos! Reporte enviado', duration: 2500, color: 'success',
      });
      await t.present();
    } catch {
      const t = await this.toastCtrl.create({ message: 'Error al enviar el reporte', duration: 2000, color: 'danger' });
      await t.present();
    } finally {
      this.submitting.set(false);
    }
  }

  timeAgo(d: string) { return this.svc.timeAgo(d); }
}