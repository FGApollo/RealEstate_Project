import { ArrowRight, Heart, Lightbulb, MapPin } from 'lucide-react';

const SwipeSuggestionsPanel = ({ categories, detailsByCategory, properties, favorites, getCategoryKey, onSelectCategory, onToggleFavorite }) => (
  <aside className="swipe-experience-panel swipe-suggestions-panel">
    <div className="swipe-panel-heading suggestions-heading">
      <span className="swipe-panel-icon suggestions-icon"><Lightbulb size={21} /></span>
      <h2>Gợi ý cho bạn</h2>
      <button type="button" onClick={() => onSelectCategory('Tất cả')}>Xem tất cả <ArrowRight size={14} /></button>
    </div>
    <div className="swipe-suggestion-list">
      {categories.map((category) => {
        const fallback = detailsByCategory[category];
        const property = properties.find((item) => getCategoryKey(item.property_type) === category && item.thumbnail);
        const title = property?.title || fallback?.title || category;
        const location = property?.address || [property?.district, property?.city].filter(Boolean).join(', ') || fallback?.location || '';
        const image = property?.thumbnail || fallback?.image;
        const isFavorite = property && favorites.some((favorite) => favorite.id === property.id);
        return (
          <article className="swipe-suggestion-card" key={category}>
            {image && <img src={image} alt="" loading="lazy" />}
            <span className="swipe-suggestion-shade" />
            <button type="button" className="swipe-suggestion-open" onClick={() => onSelectCategory(category)} aria-label={`Khám phá ${title}`} />
            {property ? (
              <button
                type="button"
                className={`swipe-suggestion-heart ${isFavorite ? 'active' : ''}`}
                aria-label={isFavorite ? 'Bỏ yêu thích' : 'Thêm yêu thích'}
                onClick={(event) => { event.stopPropagation(); onToggleFavorite(property); }}
              ><Heart size={19} fill={isFavorite ? 'currentColor' : 'none'} /></button>
            ) : <span className="swipe-suggestion-heart" aria-hidden="true"><Heart size={19} /></span>}
            <span className="swipe-suggestion-copy"><strong>{title}</strong>{location && <small><MapPin size={14} />{location}</small>}</span>
          </article>
        );
      })}
    </div>
  </aside>
);

export default SwipeSuggestionsPanel;
