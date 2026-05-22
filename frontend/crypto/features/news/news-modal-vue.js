// news-modal-vue.js - модальное окно новостей на Vue.js
(function() {
    'use strict';
    
    if (typeof Vue === 'undefined') {

        return;
    }

    const { createApp } = Vue;

    const newsModalApp = createApp({
        data() {
            return {
                isOpen: false,
                title: '',
                content: '',
                image: '',
                source: '',
                date: '',
                link: '',
                categoryName: 'Новость',
                categoryIcon: 'bi bi-newspaper',
                categoryColor: '#667eea',
                isTranslated: false,
                isTranslating: false,
                originalData: null
            };
        },
        methods: {
            open(newsItem) {

                
                // Подготавливаем данные
                this.title = newsItem.title || 'Без названия';
                this.content = this.formatContent(newsItem.fullDescription || newsItem.description);
                this.image = newsItem.image;
                this.source = newsItem.source || 'Источник';
                this.date = newsItem.formattedDate || 'Недавно';
                this.link = newsItem.link;
                
                // Стиль категории
                const categoryInfo = this.getCategoryInfo(newsItem.category);
                this.categoryName = categoryInfo.name;
                this.categoryIcon = categoryInfo.icon;
                this.categoryColor = newsItem.color || categoryInfo.color;
                
                // Сохраняем оригинал для перевода
                this.originalData = {
                    title: newsItem.title,
                    content: newsItem.fullDescription || newsItem.description
                };
                this.isTranslated = false;
                
                // Открываем модальное окно
                this.isOpen = true;
                document.body.style.overflow = 'hidden';
            },
            
            close() {
                this.isOpen = false;
                document.body.style.overflow = '';
            },
            
            handleBackdropClick(event) {
                // Закрываем только при клике непосредственно на backdrop
                if (event.target.classList.contains('news-modal-premium-overlay')) {
                    this.close();
                }
            },
            
            handleImageError(event) {
                // Защита от бесконечного цикла, если сам placeholder тоже не загрузится
                if (event.target.dataset.placeholderSet) {
                    event.target.style.display = 'none';
                    return;
                }
                event.target.dataset.placeholderSet = 'true';
                event.target.src = this.getPlaceholderImage();
            },
            
            async toggleTranslate() {
                if (this.isTranslating || !this.originalData) return;
                
                if (this.isTranslated) {
                    // Восстанавливаем оригинал
                    this.title = this.originalData.title;
                    this.content = this.formatContent(this.originalData.content);
                    this.isTranslated = false;
                } else {
                    // Переводим
                    this.isTranslating = true;
                    
                    try {
                        const [translatedTitle, translatedContent] = await Promise.all([
                            this.translateText(this.originalData.title),
                            this.translateText(this.originalData.content)
                        ]);
                        
                        this.title = translatedTitle;
                        this.content = this.formatContent(translatedContent);
                        this.isTranslated = true;
                        
                        if (window.showNotification) {
                            window.showNotification('Текст переведён', 'success');
                        }
                    } catch (error) {

                        if (window.showNotification) {
                            window.showNotification('Ошибка перевода', 'error');
                        }
                    } finally {
                        this.isTranslating = false;
                    }
                }
            },
            
            async translateText(text) {
                if (!text || text.length < 10) return text;
                const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.slice(0, 500))}&langpair=en|ru`;
                try {
                    const response = await fetch(url);
                    const contentType = response.headers.get('content-type') || '';
                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                    if (!contentType.includes('application/json')) {

                        throw new Error('Translation API returned non-JSON');
                    }
                    const data = await response.json();
                    if (data.responseData?.translatedText) {
                        return data.responseData.translatedText;
                    }
                    throw new Error('Translation failed');
                } catch (e) {

                    return text; // Возвращаем оригинал при ошибке
                }
            },
            
            formatContent(text) {
                if (!text) return '<p>Содержимое недоступно</p>';
                
                // Разбиваем на абзацы и форматируем
                const paragraphs = text.split('\n').filter(p => p.trim());
                return paragraphs.map(p => `<p>${this.escapeHtml(p)}</p>`).join('');
            },
            
            escapeHtml(text) {
                const div = document.createElement('div');
                div.textContent = text;
                return div.innerHTML;
            },
            
            getCategoryInfo(category) {
                const categories = {
                    'crypto': { 
                        name: 'Криптовалюты', 
                        icon: 'bi bi-currency-bitcoin',
                        color: '#f7931a'
                    },
                    'forex': { 
                        name: 'Форекс', 
                        icon: 'bi bi-currency-exchange',
                        color: '#10b981'
                    },
                    'general': { 
                        name: 'Общие новости', 
                        icon: 'bi bi-newspaper',
                        color: '#667eea'
                    },
                    'all': { 
                        name: 'Все новости', 
                        icon: 'bi bi-globe',
                        color: '#667eea'
                    }
                };
                return categories[category] || categories['general'];
            },
            
            getPlaceholderImage() {
                return `https://placehold.co/1200x600/${this.categoryColor.replace('#', '')}/ffffff?text=News`;
            }
        },
        
        mounted() {

            
            // Глобальный доступ
            window.openNewsModalVue = (newsItem) => {
                this.open(newsItem);
            };
            
            // Обработчик клавиши ESC
            const handleEsc = (e) => {
                if (e.key === 'Escape' && this.isOpen) {
                    this.close();
                }
            };
            
            document.addEventListener('keydown', handleEsc);
        }
    });

    const initModal = () => {
        const el = document.getElementById('newsModalApp');
        if (!el) {

            return;
        }
        
        try {
            if (window._newsModalVueApp) {
                try { window._newsModalVueApp.unmount(); } catch (e) {}
            }
            newsModalApp.mount('#newsModalApp');
            window._newsModalVueApp = newsModalApp;

        } catch (error) {

        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initModal);
    } else {
        initModal();
    }

})();
