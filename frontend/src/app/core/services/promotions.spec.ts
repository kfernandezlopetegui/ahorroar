import { TestBed } from '@angular/core/testing';

import { Promotions } from './promotions';

describe('Promotions', () => {
  let service: Promotions;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Promotions);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
