import { Component, OnInit, signal, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  IonContent, IonHeader, IonToolbar, IonTitle,
  IonSearchbar, IonChip, IonCard,
  IonCardHeader, IonCardTitle, IonCardContent,
  IonBadge, IonSpinner, IonText, IonButton,
  IonIcon, IonRefresher, IonRefresherContent,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { personOutline, cardOutline, cartOutline } from 'ionicons/icons';
import { PromotionsService, CATEGORIES } from '../core/services/promotions';
import { AuthService } from '../core/services/auth';
import { DecimalPipe } from '@angular/common';
import { CardsService } from '../core/services/cards';
import { ListaService } from '../core/services/lista';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    DecimalPipe, RouterLink,
    IonContent, IonHeader, IonToolbar, IonTitle,
    IonSearchbar, IonChip, IonCard,
    IonCardHeader, IonCardTitle, IonCardContent,
    IonBadge, IonSpinner, IonText, IonButton,
    IonIcon, IonRefresher, IonRefresherContent,
  ],
  templateUrl: './home.page.html',
})
export class HomePage implements OnInit {
  categories = CATEGORIES;
  selectedCategory = signal('todos');
  searchQuery = signal('');

  // Badge del carrito
  cartCount = computed(() => this.lista.totalItems());

  filteredPromotions = computed(() => {
    const query = this.searchQuery().toLowerCase();
    return this.svc.promotions().filter(p =>
      !query ||
      p.title.toLowerCase().includes(query) ||
      p.bank.toLowerCase().includes(query) ||
      p.store?.toLowerCase().includes(query),
    );
  });

  get loading() { return this.svc.loading; }
  get error()   { return this.svc.error; }

  constructor(
    public svc: PromotionsService,
    public auth: AuthService,
    public cardsSvc: CardsService,
    public lista: ListaService,
  ) {
    addIcons({ personOutline, cardOutline, cartOutline });
  }

  async ngOnInit() {
    await this.cardsSvc.loadCards();
    const banks = this.cardsSvc.getBankNames();
    banks.length > 0
      ? this.svc.loadByUserCards(banks)
      : this.svc.loadAll();
  }

  selectCategory(value: string) {
    this.selectedCategory.set(value);
    this.svc.loadAll(value === 'todos' ? undefined : value);
  }

  onSearch(event: any) {
    this.searchQuery.set(event.detail.value ?? '');
  }

  async refresh(event: any) {
    await this.svc.loadAll(
      this.selectedCategory() === 'todos' ? undefined : this.selectedCategory(),
    );
    event.detail.complete();
  }

  getDaysLabel(days: number[]): string {
    if (!days?.length || days.length === 7) return 'Todos los días';
    const names = ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
    return days.map(d => names[d]).join(', ');
  }
}