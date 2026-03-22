import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ComparadorPage } from './comparador.page';

describe('ComparadorPage', () => {
  let component: ComparadorPage;
  let fixture: ComponentFixture<ComparadorPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(ComparadorPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
