import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, Heart, Loader2, Sparkles } from 'lucide-react';
import { API_BASE_URL } from '../config';
import { apiFetch } from '../auth/apiClient';
import { useAuth } from '../auth/useAuth';
import { roleDestination } from '../auth/roleDestination';
import './LifestyleOnboarding.css';

const STEP_COUNT = 6;
const EMPTY_PREFERENCES = {
  listing_type: '',
  preferred_property_types: [],
  preferred_location_keys: [],
  min_price: null,
  max_price: null,
  min_bedrooms: null,
  max_bedrooms: null,
  min_area: null,
  max_area: null,
  preferred_features: []
};

const RENT_BUDGETS = [
  { id: 'rent-under-5', label: 'Dưới 5 triệu', min: null, max: 5000000 },
  { id: 'rent-5-10', label: '5 – 10 triệu', min: 5000000, max: 10000000 },
  { id: 'rent-10-20', label: '10 – 20 triệu', min: 10000000, max: 20000000 },
  { id: 'rent-20-30', label: '20 – 30 triệu', min: 20000000, max: 30000000 },
  { id: 'rent-over-30', label: 'Trên 30 triệu', min: 30000000, max: null }
];
const SALE_BUDGETS = [
  { id: 'sale-under-1', label: 'Dưới 1 tỷ', min: null, max: 1000000000 },
  { id: 'sale-1-3', label: '1 – 3 tỷ', min: 1000000000, max: 3000000000 },
  { id: 'sale-3-5', label: '3 – 5 tỷ', min: 3000000000, max: 5000000000 },
  { id: 'sale-5-10', label: '5 – 10 tỷ', min: 5000000000, max: 10000000000 },
  { id: 'sale-over-10', label: 'Trên 10 tỷ', min: 10000000000, max: null }
];
const BEDROOM_CHOICES = [
  { id: 'any', label: 'Linh hoạt', min: null },
  { id: '1plus', label: '1 phòng trở lên', min: 1 },
  { id: '2plus', label: '2 phòng trở lên', min: 2 },
  { id: '3plus', label: '3 phòng trở lên', min: 3 },
  { id: '4plus', label: '4 phòng trở lên', min: 4 }
];
const AREA_CHOICES = [
  { id: 'any', label: 'Linh hoạt', min: null, max: null },
  { id: 'under30', label: 'Dưới 30 m²', min: null, max: 30 },
  { id: '30to60', label: '30 – 60 m²', min: 30, max: 60 },
  { id: '60to100', label: '60 – 100 m²', min: 60, max: 100 },
  { id: 'over100', label: 'Trên 100 m²', min: 100, max: null }
];

const fromRecord = (record) => record ? {
  listing_type: record.listing_type || 'RENT',
  preferred_property_types: record.preferred_property_types || [],
  preferred_location_keys: record.preferred_location_keys || [],
  min_price: record.min_price,
  max_price: record.max_price,
  min_bedrooms: record.min_bedrooms,
  max_bedrooms: record.max_bedrooms,
  min_area: record.min_area,
  max_area: record.max_area,
  preferred_features: record.preferred_features || []
} : EMPTY_PREFERENCES;

export default function LifestyleOnboarding() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const editing = searchParams.get('edit') === '1';
  const [preferences, setPreferences] = useState(EMPTY_PREFERENCES);
  const [options, setOptions] = useState({ property_types: [], locations: [], features: [] });
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const [preferenceResponse, optionsResponse] = await Promise.all([
          apiFetch(`${API_BASE_URL}/api/me/preferences`),
          apiFetch(`${API_BASE_URL}/api/me/preference-options`)
        ]);
        const preferenceData = await preferenceResponse.json();
        const optionsData = await optionsResponse.json();
        if (!preferenceResponse.ok || !optionsResponse.ok) {
          throw new Error(preferenceData.error || optionsData.error || 'Không thể tải gu tìm nhà lúc này.');
        }
        if (!active) return;
        if (user?.role && String(user.role).toUpperCase() !== 'USER') {
          navigate(roleDestination(user.role), { replace: true });
          return;
        }
        if (preferenceData.preferences?.onboarding_completed && !editing) {
          navigate(location.state?.from || '/swipe/T%E1%BA%A5t%20c%E1%BA%A3', { replace: true });
          return;
        }
        setPreferences(fromRecord(preferenceData.preferences));
        setOptions(optionsData.options || { property_types: [], locations: [], features: [] });
      } catch (loadError) {
        if (active) setError(loadError.message || 'Không thể tải gu tìm nhà lúc này.');
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, [editing, location.state, navigate, user?.id, user?.role]);

  const budgetOptions = useMemo(() => preferences.listing_type === 'SALE' ? SALE_BUDGETS : RENT_BUDGETS, [preferences.listing_type]);
  const selectedBudget = budgetOptions.find((option) =>
    Number(option.min ?? -1) === Number(preferences.min_price ?? -1)
      && Number(option.max ?? -1) === Number(preferences.max_price ?? -1))?.id || '';
  const selectedBedroom = BEDROOM_CHOICES.find((choice) => Number(choice.min ?? -1) === Number(preferences.min_bedrooms ?? -1))?.id || 'any';
  const selectedArea = AREA_CHOICES.find((choice) =>
    Number(choice.min ?? -1) === Number(preferences.min_area ?? -1)
      && Number(choice.max ?? -1) === Number(preferences.max_area ?? -1))?.id || 'any';

  const toggleArrayValue = (field, value) => setPreferences((current) => ({
    ...current,
    [field]: current[field].includes(value)
      ? current[field].filter((item) => item !== value)
      : [...current[field], value]
  }));

  const continueStep = () => {
    setError('');
    if (step === 1 && !preferences.listing_type) {
      setError('Chọn thuê hoặc mua để Nesty hiểu đúng khoảng giá nhé.');
      return;
    }
    setStep((current) => Math.min(STEP_COUNT, current + 1));
  };

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const response = await apiFetch(`${API_BASE_URL}/api/me/preferences`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(preferences)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Lưu gu tìm nhà thất bại.');
      navigate(editing ? (location.state?.from || '/profile') : '/swipe/T%E1%BA%A5t%20c%E1%BA%A3', { replace: true });
    } catch (saveError) {
      setError(saveError.message || 'Lưu gu tìm nhà thất bại. Vui lòng thử lại.');
    } finally {
      setSaving(false);
    }
  };

  const leaveOnboarding = () => {
    navigate(editing ? (location.state?.from || '/profile') : '/swipe/T%E1%BA%A5t%20c%E1%BA%A3', { replace: true });
  };

  if (loading) return <main className="lifestyle-onboarding loading-state"><Loader2 className="onboarding-spin" /><span>Nesty đang chuẩn bị vài câu hỏi cho bạn…</span></main>;
  if (error && !options.property_types.length && !preferences.preferred_property_types.length) {
    return <main className="lifestyle-onboarding"><div className="onboarding-error" role="alert">{error}<button type="button" onClick={() => window.location.reload()}>Thử lại</button></div></main>;
  }

  return (
    <main className="lifestyle-onboarding">
      <div className="onboarding-shell">
        <div className="onboarding-brand"><span className="onboarding-brand-mark">N</span><span>Swipe Nest</span></div>
        <div className="onboarding-progress-row"><span>BƯỚC {step} / {STEP_COUNT}</span><span>{Math.round(step / STEP_COUNT * 100)}%</span></div>
        <div className="onboarding-progress-track"><span style={{ width: `${step / STEP_COUNT * 100}%` }} /></div>

        <section className="onboarding-card" aria-live="polite">
          <div className="onboarding-card-top">
            <div className="onboarding-step-icon"><Sparkles size={20} /></div>
            <img src="/mascots/otter-builder-paper.png" alt="" className="onboarding-mascot" />
          </div>

          {step === 1 && <>
            <p className="onboarding-eyebrow">BẮT ĐẦU TỪ ĐÂU NÈ?</p>
            <h1>{editing ? 'Gu sống của bạn bắt đầu từ đâu?' : 'Bạn đang tìm tổ ấm để…'}</h1>
            <p className="onboarding-description">Nesty sẽ dùng lựa chọn này để so sánh những tin có cùng mục đích.</p>
            <div className="onboarding-choice-grid two-columns">
              {[['RENT', 'Thuê nhà', 'Tìm chỗ ở hợp gu'], ['SALE', 'Mua nhà', 'Tìm nơi an cư lâu dài']].map(([value, title, description]) => (
                <button key={value} type="button" className={`onboarding-choice-card ${preferences.listing_type === value ? 'selected' : ''}`} onClick={() => setPreferences((current) => ({ ...current, listing_type: value, min_price: null, max_price: null }))}>
                  <span className="choice-check"><Check size={14} /></span><strong>{title}</strong><small>{description}</small>
                </button>
              ))}
            </div>
          </>}

          {step === 2 && <>
            <p className="onboarding-eyebrow">CHỌN KIỂU NHÀ BẠN THÍCH</p>
            <h1>Bạn muốn khám phá loại nào?</h1>
            <p className="onboarding-description">Chọn vài kiểu cũng được, Nesty sẽ ưu tiên trước.</p>
            <div className="onboarding-chip-grid">
              {options.property_types.map((item) => (
                <button key={item.key} type="button" className={`onboarding-chip ${preferences.preferred_property_types.includes(item.key) ? 'selected' : ''}`} onClick={() => toggleArrayValue('preferred_property_types', item.key)}>
                  {preferences.preferred_property_types.includes(item.key) && <Check size={15} />}{item.label}
                </button>
              ))}
              {!options.property_types.length && <p className="onboarding-muted">Tin đăng mới sẽ giúp Nesty cá nhân hoá loại nhà bạn thích.</p>}
            </div>
          </>}

          {step === 3 && <>
            <p className="onboarding-eyebrow">KHU VỰC CỦA BẠN</p>
            <h1>Ở đâu thì thấy “đúng gu”?</h1>
            <p className="onboarding-description">Khu vực được lấy từ tin đang có trên Swipe Nest. Bạn có thể chọn nhiều nơi.</p>
            <div className="onboarding-chip-grid scrollable-chips">
              {options.locations.map((item) => (
                <button key={item.key} type="button" className={`onboarding-chip ${preferences.preferred_location_keys.includes(item.key) ? 'selected' : ''}`} onClick={() => toggleArrayValue('preferred_location_keys', item.key)}>
                  {preferences.preferred_location_keys.includes(item.key) && <Check size={15} />}{item.label}
                </button>
              ))}
              {!options.locations.length && <p className="onboarding-muted">Chưa có khu vực để chọn. Bạn có thể tiếp tục, Nesty sẽ mở rộng gợi ý.</p>}
            </div>
          </>}

          {step === 4 && <>
            <p className="onboarding-eyebrow">NGÂN SÁCH THOẢI MÁI</p>
            <h1>Khoảng giá nào hợp với bạn?</h1>
            <p className="onboarding-description">Bạn có thể bỏ qua để xem nhiều lựa chọn hơn.</p>
            <div className="onboarding-chip-grid">
              {budgetOptions.map((budget) => (
                <button key={budget.id} type="button" className={`onboarding-chip ${selectedBudget === budget.id ? 'selected' : ''}`} onClick={() => setPreferences((current) => ({ ...current, min_price: budget.min, max_price: budget.max }))}>
                  {selectedBudget === budget.id && <Check size={15} />}{budget.label}
                </button>
              ))}
              <button type="button" className={`onboarding-chip ${selectedBudget === '' && preferences.min_price == null && preferences.max_price == null ? 'selected' : ''}`} onClick={() => setPreferences((current) => ({ ...current, min_price: null, max_price: null }))}>Linh hoạt</button>
            </div>
          </>}

          {step === 5 && <>
            <p className="onboarding-eyebrow">KHÔNG GIAN VỪA ĐỦ</p>
            <h1>Nhà cần mấy phòng, rộng cỡ nào?</h1>
            <p className="onboarding-description">Cứ chọn gần đúng thôi — mình có thể đổi gu bất cứ lúc nào.</p>
            <h2 className="onboarding-subheading">Phòng ngủ</h2>
            <div className="onboarding-chip-grid compact-chips">
              {BEDROOM_CHOICES.map((choice) => (
                <button key={choice.id} type="button" className={`onboarding-chip ${selectedBedroom === choice.id ? 'selected' : ''}`} onClick={() => setPreferences((current) => ({ ...current, min_bedrooms: choice.min, max_bedrooms: null }))}>{choice.label}</button>
              ))}
            </div>
            <h2 className="onboarding-subheading area-heading">Diện tích</h2>
            <div className="onboarding-chip-grid compact-chips">
              {AREA_CHOICES.map((choice) => (
                <button key={choice.id} type="button" className={`onboarding-chip ${selectedArea === choice.id ? 'selected' : ''}`} onClick={() => setPreferences((current) => ({ ...current, min_area: choice.min, max_area: choice.max }))}>{choice.label}</button>
              ))}
            </div>
          </>}

          {step === 6 && <>
            <p className="onboarding-eyebrow">MỘT CHÚT CHẤT RIÊNG</p>
            <h1>Tiện ích nào làm bạn mê?</h1>
            <p className="onboarding-description">Chỉ hiện những điều đã có trong mô tả tin đăng.</p>
            <div className="onboarding-chip-grid scrollable-chips">
              {options.features.map((item) => (
                <button key={item.key} type="button" className={`onboarding-chip ${preferences.preferred_features.includes(item.key) ? 'selected' : ''}`} onClick={() => toggleArrayValue('preferred_features', item.key)}>
                  {preferences.preferred_features.includes(item.key) && <Check size={15} />}{item.label}
                </button>
              ))}
              {!options.features.length && <p className="onboarding-muted">Chưa có tiện ích để chọn — Nesty vẫn có thể gợi ý theo loại nhà, khu vực và ngân sách.</p>}
            </div>
            <div className="onboarding-finish-note"><Heart size={17} fill="currentColor" />Nesty đã hiểu gu của bạn. Cùng xem thử nhé!</div>
          </>}

          {error && <p className="onboarding-inline-error" role="alert">{error}</p>}
          <div className="onboarding-actions">
            {step > 1
              ? <button className="onboarding-back" type="button" onClick={() => setStep((current) => current - 1)}><ArrowLeft size={17} /> Quay lại</button>
              : <button className="onboarding-back onboarding-skip" type="button" onClick={leaveOnboarding}>{editing ? 'Hủy' : 'Để sau'}</button>}
            {step < STEP_COUNT ? (
              <button className="onboarding-continue" type="button" onClick={continueStep}>Tiếp tục <ArrowRight size={17} /></button>
            ) : (
              <button className="onboarding-continue" type="button" disabled={saving} onClick={save}>{saving ? <><Loader2 className="onboarding-spin" size={17} /> Đang lưu…</> : <>{editing ? 'Lưu gu của tôi' : 'Khám phá nhà dành cho bạn'} <ArrowRight size={17} /></>}</button>
            )}
          </div>
        </section>
        <p className="onboarding-footnote">Bạn có thể thay đổi gu này bất cứ lúc nào trong hồ sơ.</p>
      </div>
    </main>
  );
}
