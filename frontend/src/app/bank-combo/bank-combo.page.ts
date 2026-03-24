import { Component } from '@angular/core';
import {
  IonContent, IonHeader, IonToolbar, IonTitle,
  IonButton, IonIcon, IonSpinner, IonText,
  IonCard, IonCardContent, IonBadge, IonChip,
  IonItem, IonLabel, IonInput, IonSelect, IonSelectOption,
} from '@ionic/angular/standalone';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { addIcons } from 'ionicons';
import { calculatorOutline, cardOutline, trendingDownOutline, checkmarkCircleOutline } from 'ionicons/icons';
import { BankComboService } from '../core/services/bank-combo';
import { CATEGORIES } from '../core/services/promotions';

@Component({
  selector: 'app-bank-combo',
  standalone: true,
  imports: [
    ReactiveFormsModule, DecimalPipe,
    IonContent, IonHeader, IonToolbar, IonTitle,
    IonButton, IonIcon, IonSpinner, IonText,
    IonCard, IonCardContent, IonBadge, 
    IonItem, IonLabel, IonInput, IonSelect, IonSelectOption
  ],
  templateUrl: './bank-combo.page.html',
})
export class BankComboPage {
  categories = CATEGORIES;

  form = this.fb.group({
    store:     ['', Validators.required],
    monto:     [null as number | null, [Validators.required, Validators.min(1)]],
    categoria: ['todos'],
  });

  get results() { return this.svc.results; }
  get loading() { return this.svc.loading; }
  get error()   { return this.svc.error; }

  constructor(public svc: BankComboService, private fb: FormBuilder) {
    addIcons({ calculatorOutline, cardOutline, trendingDownOutline, checkmarkCircleOutline });
  }

  async calcular() {
    if (this.form.invalid) return;
    const { store, monto, categoria } = this.form.value;
    await this.svc.calcular(store!, monto!, categoria === 'todos' ? undefined : categoria ?? undefined);
  }

  getDaysLabel(days: number[]): string {
    if (!days?.length || days.length === 7) return 'Todos los días';
    const names = ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
    return days.map(d => names[d]).join(', ');
  }
}