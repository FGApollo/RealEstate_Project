import { useState } from 'react';
import { Layers3, Search } from 'lucide-react';
import {
  HomeAreaDropdown,
  HomeListingTypeDropdown,
  HomePriceDropdown,
  HomePropertyTypeDropdown
} from '../home/HomeSearchDropdowns';
import { priceRangeOf } from './searchParams';
import './SearchFilterBar.css';

// The parent keys this form by the URL, so Back/Forward and filter chips reset
// its draft without an effect that can overwrite a user's current input.
const SearchFilterBar = ({ search, onApply }) => {
  const [draft, setDraft] = useState(() => ({
    province: search.province,
    ward: search.ward,
    types: search.types || [],
    minPrice: search.minPrice || '',
    maxPrice: search.maxPrice || '',
    listing: search.listing || ''
  }));

  const applyPatch = (patch) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    onApply({
      ...search,
      province: next.province,
      ward: next.ward,
      types: next.types,
      minPrice: next.minPrice,
      maxPrice: next.maxPrice,
      listing: next.listing
    });
  };

  const submit = (event) => {
    event.preventDefault();
    applyPatch({});
  };

  return (
    <form className="search-page-bar" onSubmit={submit} role="search" aria-label="Bộ lọc bất động sản">
      <HomeAreaDropdown
        variant="search"
        province={draft.province}
        ward={draft.ward}
        onChange={(area) => applyPatch({ province: area.province, ward: area.ward })}
      />
      <HomePropertyTypeDropdown
        variant="search"
        label="Loại BĐS"
        icon={Layers3}
        selectedCategories={draft.types}
        onApplyCategories={(types) => applyPatch({ types })}
      />
      <HomePriceDropdown
        variant="search"
        priceRange={priceRangeOf(draft)}
        minPrice={draft.minPrice}
        maxPrice={draft.maxPrice}
        onApplyPrice={({ minPrice, maxPrice }) => applyPatch({ minPrice, maxPrice })}
      />
      <HomeListingTypeDropdown
        variant="search"
        listing={draft.listing}
        onChange={(listing) => applyPatch({ listing })}
      />
      <button type="submit" className="search-page-submit">
        <Search size={18} aria-hidden="true" />
        <span>Tìm kiếm</span>
      </button>
    </form>
  );
};

export default SearchFilterBar;
