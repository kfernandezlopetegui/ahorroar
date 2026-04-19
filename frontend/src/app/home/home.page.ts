import { Component, OnInit, signal, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  IonContent, IonHeader, IonToolbar, IonTitle,
  IonSearchbar, IonChip, IonCard, IonCardHeader,
  IonCardTitle, IonCardContent, IonBadge, IonSpinner,
  IonText, IonButton, IonIcon, IonRefresher,
  IonRefresherContent, IonInfiniteScroll,
  IonInfiniteScrollContent, IonModal, IonNote,
} from '@ionic/angular/standalone';
import { DecimalPipe, SlicePipe } from '@angular/common';
import { addIcons } from 'ionicons';
import {
  personOutline, cartOutline, calculatorOutline,
  informationCircleOutline,
} from 'ionicons/icons';
import { PromotionsService, CATEGORIES, Promotion } from '../core/services/promotions';
import { AuthService } from '../core/services/auth';
import { CardsService } from '../core/services/cards';
import { ListaService } from '../core/services/lista';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    DecimalPipe, SlicePipe, RouterLink,
    IonContent, IonHeader, IonToolbar, IonTitle,
    IonSearchbar, IonChip, IonCard, IonCardHeader,
    IonCardTitle, IonCardContent, IonBadge, IonSpinner,
    IonText, IonButton, IonIcon, IonRefresher,
    IonRefresherContent, IonInfiniteScroll,
    IonInfiniteScrollContent, IonModal,
  ],
  templateUrl: './home.page.html',
})
export class HomePage implements OnInit {
  categories       = CATEGORIES;
  selectedCategory = signal('todos');
  searchQuery      = signal('');
  isDetailOpen     = signal(false);
  selectedPromo    = signal<Promotion | null>(null);
  userBanks        = signal<string[]>([]);

  cartCount = computed(() => this.lista.totalItems());

  filteredPromotions = computed(() => {
    const q = this.searchQuery().toLowerCase();
    if (!q) return this.svc.promotions();
    return this.svc.promotions().filter(p =>
      p.title.toLowerCase().includes(q)   ||
      p.bank.toLowerCase().includes(q)    ||
      p.store?.toLowerCase().includes(q),
    );
  });

  get loading()  { return this.svc.loading;     }
  get error()    { return this.svc.error;        }
  get hasMore()  { return this.svc.hasMore;      }

  constructor(
    public  svc:      PromotionsService,
    public  auth:     AuthService,
    public  cardsSvc: CardsService,
    public  lista:    ListaService,
  ) {
    addIcons({ personOutline, cartOutline, calculatorOutline, informationCircleOutline });
  }

  async ngOnInit() {
    await this.cardsSvc.loadCards();
    const banks = this.cardsSvc.getBankNames();
    this.userBanks.set(banks);
    this.svc.setUserBanks(banks);
    await this.svc.loadAll('todos');
  }

  isMyBank(bank: string): boolean {
    return this.userBanks().some(b =>
      bank?.toLowerCase().includes(b.toLowerCase())
    );
  }

  async selectCategory(value: string) {
    this.selectedCategory.set(value);
    this.searchQuery.set('');
    await this.svc.loadAll(value === 'todos' ? 'todos' : value);
  }

  onSearch(event: any) {
    this.searchQuery.set(event.detail.value ?? '');
  }

  async loadMore(event: any) {
    await this.svc.loadMore();
    event.target.complete();
  }

  async refresh(event: any) {
    await this.svc.loadAll(this.selectedCategory());
    event.detail.complete();
  }

  openDetail(promo: Promotion) {
    this.selectedPromo.set(promo);
    this.isDetailOpen.set(true);
  }

  getDaysLabel(days: number[]): string {
    if (!days?.length || days.length === 7) return 'Todos los días';
    const names = ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
    return days.map(d => names[d]).join(', ');
  }
}