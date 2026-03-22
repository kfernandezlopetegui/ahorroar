import { Component, OnInit, signal, computed } from '@angular/core';
import {
  IonContent, IonHeader, IonToolbar, IonTitle,
  IonSearchbar, IonChip, IonCard, IonCardHeader,
  IonCardTitle, IonCardContent, IonBadge, IonButton,
  IonIcon, IonSpinner, IonText, IonFab, IonFabButton,
  IonModal, IonItem, IonLabel, IonInput, IonSelect,
  IonSelectOption, ToastController
} from '@ionic/angular/standalone';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { addIcons } from 'ionicons';
import { addOutline, thumbsUpOutline, copyOutline, timeOutline } from 'ionicons/icons';
import { CouponsService, COUPON_CATEGORIES } from '../core/services/coupons';
import { Clipboard } from '@angular/cdk/clipboard';

@Component({
  selector: 'app-coupons',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    IonContent, IonHeader, IonToolbar, IonTitle,
    IonSearchbar, IonChip, IonCard, IonCardHeader,
    IonCardTitle, IonCardContent, IonBadge, IonButton,
    IonIcon, IonSpinner, IonFab, IonFabButton,
    IonModal, IonItem, IonLabel, IonInput, IonSelect,
    IonSelectOption
  ],
  templateUrl: './coupons.page.html',
})
export class CouponsPage implements OnInit {
  categories = COUPON_CATEGORIES;
  selectedCategory = signal('todos');
  searchQuery = signal('');
  isModalOpen = signal(false);
  submitting = signal(false);

  filteredCoupons = computed(() => {
    const query = this.searchQuery().toLowerCase();
    return this.svc.coupons().filter(c =>
      !query ||
      c.title.toLowerCase().includes(query) ||
      c.store.toLowerCase().includes(query) ||
      c.code.toLowerCase().includes(query)
    );
  });

  form = this.fb.group({
    title:       ['', Validators.required],
    code:        ['', Validators.required],
    store:       ['', Validators.required],
    category:    ['otros', Validators.required],
    discount_pct:[null],
    valid_until: ['', Validators.required],
  });

  get loading() { return this.svc.loading; }
  get error()   { return this.svc.error; }

  constructor(
    public svc: CouponsService,
    private fb: FormBuilder,
    private clipboard: Clipboard,
    private toastCtrl: ToastController
  ) {
    addIcons({ addOutline, thumbsUpOutline, copyOutline, timeOutline });
  }

  ngOnInit() {
    this.svc.loadAll();
  }

  selectCategory(value: string) {
    this.selectedCategory.set(value);
    this.svc.loadAll(value === 'todos' ? undefined : value);
  }

  onSearch(event: any) {
    this.searchQuery.set(event.detail.value ?? '');
  }

  async copyCode(code: string) {
    this.clipboard.copy(code);
    const toast = await this.toastCtrl.create({
      message: `Código ${code} copiado`,
      duration: 2000,
      position: 'bottom',
      color: 'success',
    });
    await toast.present();
  }

  async upvote(id: string) {
    await this.svc.upvote(id);
  }

  async submitCoupon() {
    if (this.form.invalid) return;
    this.submitting.set(true);
    try {
      await this.svc.addCoupon(this.form.value as any);
      this.isModalOpen.set(false);
      this.form.reset({ category: 'otros' });
      const toast = await this.toastCtrl.create({
        message: 'Cupón agregado, gracias!',
        duration: 2000,
        color: 'success',
      });
      await toast.present();
    } catch {
      const toast = await this.toastCtrl.create({
        message: 'No se pudo agregar el cupón.',
        duration: 2000,
        color: 'danger',
      });
      await toast.present();
    } finally {
      this.submitting.set(false);
    }
  }

  isExpiringSoon(date: string) { return this.svc.isExpiringSoon(date); }
  daysUntilExpiry(date: string) { return this.svc.daysUntilExpiry(date); }
}