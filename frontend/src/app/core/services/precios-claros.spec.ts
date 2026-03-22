import { TestBed } from '@angular/core/testing';

import { PreciosClaros } from './precios-claros';

describe('PreciosClaros', () => {
  let service: PreciosClaros;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(PreciosClaros);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
