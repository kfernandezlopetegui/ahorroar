import { Component, OnInit, OnDestroy, signal } from '@angular/core';
import {
  IonContent, IonHeader, IonToolbar, IonTitle,
  IonCard, IonCardContent, IonButton, IonIcon,
  IonSpinner, IonText, IonChip, IonBadge,
  IonSegment, IonSegmentButton, IonLabel,
  IonFab, IonFabButton, IonModal, IonItem, IonInput,
  IonSelect, IonSelectOption, IonList, IonNote,
  ToastController,
} from '@ionic/angular/standalone';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { addIcons } from 'ionicons';
import {
  addOutline, thumbsUpOutline, trophyOutline,
  alertCircleOutline, checkmarkCircle, storefront,
  closeCircle,
} from 'ionicons/icons';
import {
  Subject, debounceTime, distinctUntilChanged,
  switchMap, of,
} from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { CommunityService, BADGE_INFO } from '../core/services/community';
import { SupabaseService } from '../core/services/supabase';
import { environment } from '../../environments/environment';

interface ProductLookup {
  ean: string; nombre: string; marca?: string; imagen?: string;
}
interface BranchResult {
  id: string; nombre: string; cadena: string; direccion: string;
}

@Component({
  selector: 'app-community',
  standalone: true,
  imports: [
    ReactiveFormsModule, DecimalPipe,
    IonContent, IonHeader, IonToolbar, IonTitle,
    IonCard, IonCardContent, IonButton, IonIcon,
    IonSpinner, IonChip, IonBadge,
    IonSegment, IonSegmentButton, IonLabel,
    IonFab, IonFabButton, IonModal, IonItem, IonInput,
    IonSelect, IonSelectOption, IonList, IonNote,
  ],
  templateUrl: './community.page.html',
})
export class CommunityPage implements OnInit, OnDestroy {
  activeSegment = signal<'reportes' | 'ranking'>('reportes');
  isModalOpen = signal(false);
  submitting = signal(false);
  leaderboard = signal<any[]>([]);
  badgeInfo = BADGE_INFO;

  // Autocomplete estado
  productFound = signal<ProductLookup | null>(null);
  loadingProduct = signal(false);
  branchResults = signal<BranchResult[]>([]);
  selectedBranch = signal<BranchResult | null>(null);
  loadingBranch = signal(false);
  eanTouched = signal(false);

  private ean$ = new Subject<string>();
  private branch$ = new Subject<string>();
  private destroy$ = new Subject<void>();

  CADENAS = ['Carrefour', 'Coto', 'Disco', 'Jumbo', 'DIA', 'La Anónima', 'Vea', 'Walmart', 'Otro'];

  form = this.fb.group({
    ean: ['', Validators.required],
    producto_nombre: ['', Validators.required],
    cadena: ['', Validators.required],
    precio: [null as number | null, [Validators.required, Validators.min(0.01)]],
    sucursal: [''],
    direccion: [''],
    branch_query: [''],
  });

  get reports() { return this.svc.reports; }
  get loading() { return this.svc.loading; }
  get error() { return this.svc.error; }
  get userStats() { return this.svc.userStats; }

  constructor(
    public svc: CommunityService,
    private fb: FormBuilder,
    private http: HttpClient,
    private supabase: SupabaseService,
    private toastCtrl: ToastController,
  ) {
    addIcons({ addOutline, thumbsUpOutline, trophyOutline, alertCircleOutline, checkmarkCircle, storefront, closeCircle });
  }

  ngOnInit() {
    this.svc.loadReports();
    this.svc.loadUserStats();
    this.setupAutocomplete();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private setupAutocomplete() {
    // EAN → lookup producto
    this.ean$.pipe(
      debounceTime(700),
      distinctUntilChanged(),
      switchMap(ean => {
        if (ean.length < 4) return of(null);
        this.loadingProduct.set(true);
        return this.http.get<ProductLookup | null>(
          `${environment.apiUrl}/community/product-lookup/${ean}`,
        );
      }),
      takeUntil(this.destroy$),
    ).subscribe({
      next: (p) => {
        this.loadingProduct.set(false);
        this.productFound.set(p);
        if (p) {
          this.form.patchValue({ producto_nombre: p.nombre });
        }
      },
      error: () => this.loadingProduct.set(false),
    });

    // Branch search
    this.branch$.pipe(
      debounceTime(500),
      distinctUntilChanged(),
      switchMap(q => {
        if (q.length < 2 || this.selectedBranch()) {
          this.branchResults.set([]);
          return of([]);
        }
        this.loadingBranch.set(true);
        return this.http.get<BranchResult[]>(
          `${environment.apiUrl}/community/branch-search`,
          { params: { q } },
        );
      }),
      takeUntil(this.destroy$),
    ).subscribe({
      next: (res) => {
        this.loadingBranch.set(false);
        this.branchResults.set(res ?? []);
      },
      error: () => this.loadingBranch.set(false),
    });
  }

  onEanInput(ev: any) {
    const val = (ev.detail.value ?? '').trim();
    this.eanTouched.set(true);
    if (!val) { this.productFound.set(null); }
    this.ean$.next(val);
  }

  onBranchInput(ev: any) {
    this.branch$.next((ev.detail.value ?? '').trim());
  }

  selectBranch(b: BranchResult) {
    this.selectedBranch.set(b);
    this.branchResults.set([]);
    this.form.patchValue({
      cadena: b.cadena,
      sucursal: b.nombre,
      direccion: b.direccion,
      branch_query: `${b.cadena} — ${b.direccion}`,
    });
  }

  clearBranch() {
    this.selectedBranch.set(null);
    this.form.patchValue({ branch_query: '', sucursal: '', direccion: '' });
  }

  openModal() {
    this.form.reset();
    this.productFound.set(null);
    this.selectedBranch.set(null);
    this.branchResults.set([]);
    this.eanTouched.set(false);
    this.isModalOpen.set(true);
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
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.submitting.set(true);
    try {
      const { branch_query, ...rest } = this.form.value;
      const payload = {
        ...rest,
        ean: String(rest.ean ?? '').trim(),          // forzar string
        precio: Number(rest.precio),
      };
      await this.svc.createReport(payload as any);
      this.isModalOpen.set(false);
      this.form.reset();
      const t = await this.toastCtrl.create({
        message: '✅ +10 puntos! Reporte enviado', duration: 2500, color: 'success', position: 'top',
      });
      await t.present();
    } catch (err: any) {
      const msg = err?.error?.message ?? err?.message ?? 'Error al enviar el reporte';
      const t = await this.toastCtrl.create({
        message: Array.isArray(msg) ? msg.join(', ') : msg,
        duration: 3000, color: 'danger', position: 'top',
      });
      await t.present();
    } finally {
      this.submitting.set(false);
    }
  }

  timeAgo(d: string) { return this.svc.timeAgo(d); }
}